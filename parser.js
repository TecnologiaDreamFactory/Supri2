/**
 * Parser de planilhas Excel (RFQ) para modelo canônico.
 * Faz download da file_url, detecta cabeçalho, mapeia colunas e valida.
 * Retorna schema completo conforme docs/integration-schema.md
 */

const axios = require("axios");
const { readBestSheet } = require("./io/readWorkbook");
const { parsePrecoUnitario } = require("./normalize/money");
const { parseQuantidade } = require("./normalize/quantities");
const { toBoolean } = require("./normalize/boolean");
const {
  detectHeaderAndMapping,
  normalizeUnidade,
} = require("./columnMapping");

const DOWNLOAD_TIMEOUT_MS = 60000; // 60s

/**
 * Baixa o arquivo Excel de file_url e retorna o buffer.
 * @param {string} fileUrl
 * @returns {Promise<Buffer>}
 */
async function downloadExcel(fileUrl) {
  const resp = await axios.get(fileUrl, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 50 * 1024 * 1024, // 50 MB
    validateStatus: (status) => status === 200,
  });
  return Buffer.from(resp.data);
}

/**
 * Verifica se uma linha é um item válido (não é TOTAL GERAL, observações, etc.).
 */
function isValidItemRow(row, descricao) {
  const desc = String(descricao || "").trim().toLowerCase();

  const ignoreKeywords = [
    "total",
    "total geral",
    "subtotal",
    "soma",
    "grand total",
    "observa",
    "obs:",
    "nota:",
    "atenção",
    "aten",
    "instru",
    "dados do fornecedor",
  ];

  if (ignoreKeywords.some((kw) => desc.includes(kw))) {
    return false;
  }

  if (!desc) return false;

  return true;
}

/**
 * Extrai valor de célula (string ou número).
 */
function cellValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  return String(val).trim();
}

/**
 * Converte valor para número (legado - mantido para compatibilidade).
 * @deprecated Use parsePrecoUnitario ou parseQuantidade
 */
function toNumber(val) {
  const { toNumber: tn } = require("./normalize/money");
  return tn(val);
}

/**
 * Parseia o Excel e retorna o objeto no schema canônico completo.
 * @param {Buffer} buffer - Conteúdo do arquivo Excel
 * @param {string} rfqId
 * @param {string} [source]
 * @returns {object} Schema completo conforme docs/integration-schema.md
 */
function parseExcelToCanonical(buffer, rfqId, source = "") {
  const warnings = [];
  const errors = [];
  let needsReview = false;
  const normalizedSource = (source && String(source).trim()) || "unknown";

  let sheetName = "Plan1";
  let rows = [];
  try {
    const sheetData = readBestSheet(buffer);
    sheetName = sheetData.sheetName;
    rows = sheetData.rows;
  } catch (err) {
    return {
      status: "error",
      service: "rfq-parser",
      rfq_id: rfqId,
      source: normalizedSource,
      sheet: null,
      mapping: {},
      items: [],
      summary: {
        items_total: 0,
        items_parsed: 0,
        items_with_warnings: 0,
        items_invalid: 0,
        needs_review: true,
        review_reasons: ["Erro ao ler planilha: " + err.message],
      },
      warnings: [],
      errors: [{ code: "PARSE_ERROR", message: err.message }],
    };
  }

  if (!rows.length) {
    return {
      status: "error",
      service: "rfq-parser",
      rfq_id: rfqId,
      source: normalizedSource,
      sheet: { name: sheetName, header_row: null, total_rows: 0 },
      mapping: {},
      items: [],
      summary: {
        items_total: 0,
        items_parsed: 0,
        items_with_warnings: 0,
        items_invalid: 0,
        needs_review: true,
        review_reasons: ["Planilha vazia ou sem dados."],
      },
      warnings: ["Planilha vazia ou sem dados."],
      errors: [{ code: "EMPTY_SHEET", message: "Planilha vazia ou sem dados." }],
    };
  }

  const { mapping, headerRowIndex } = detectHeaderAndMapping(rows, 30);

  if (Object.keys(mapping).length === 0) {
    return {
      status: "error",
      service: "rfq-parser",
      rfq_id: rfqId,
      source: normalizedSource,
      sheet: { name: sheetName, header_row: null, total_rows: rows.length },
      mapping: {},
      items: [],
      summary: {
        items_total: 0,
        items_parsed: 0,
        items_with_warnings: 0,
        items_invalid: 0,
        needs_review: true,
        review_reasons: [
          "Não foi possível identificar cabeçalho com colunas esperadas (descrição, quantidade, preço, etc.).",
        ],
      },
      warnings: [
        "Não foi possível identificar cabeçalho com colunas esperadas (descrição, quantidade, preço, etc.).",
      ],
      errors: [{ code: "NO_HEADER", message: "Não foi possível identificar cabeçalho com colunas esperadas." }],
    };
  }

  const headerRow = rows[headerRowIndex] || [];
  const mappingOutput = {};
  const fieldToCol = {};

  const expectedFields = [
    "descricao",
    "quantidade",
    "unidade",
    "preco_unitario",
    "total",
    "prazo_entrega",
    "impostos_inclusos",
    "frete_incluso",
    "fornecedor",
  ];

  for (const [colIdxStr, { field, confidence }] of Object.entries(mapping)) {
    const colIdx = parseInt(colIdxStr, 10);
    const originalHeader = cellValue(headerRow[colIdx]);

    if (fieldToCol[field] === undefined) {
      fieldToCol[field] = colIdx;
      mappingOutput[field] = {
        original: originalHeader || null,
        confidence: Math.round(confidence * 100) / 100,
      };
    }
  }

  for (const field of expectedFields) {
    if (!mappingOutput[field]) {
      mappingOutput[field] = { original: null, confidence: 0.0 };
    }
  }

  const items = [];
  const dataStart = headerRowIndex + 1;
  let itemsWithWarnings = 0;
  let itemsInvalid = 0;
  let itemsTotal = 0;
  const reviewReasons = [];

  const mappedCols = new Set(Object.keys(mapping).map((k) => parseInt(k, 10)));
  for (let c = 0; c < headerRow.length; c++) {
    if (!mappedCols.has(c)) {
      const colName = cellValue(headerRow[c]);
      if (colName) {
        warnings.push(`Coluna '${colName}' ignorada (não mapeada)`);
      }
    }
  }

  for (const [field, { confidence }] of Object.entries(mappingOutput)) {
    if (confidence > 0 && confidence < 0.7) {
      reviewReasons.push(`Confiança baixa (<0.7) em: ${field}`);
      needsReview = true;
    }
  }

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (field) => {
      const col = fieldToCol[field];
      return col !== undefined ? cellValue(row[col]) : "";
    };

    const descricao = get("descricao");

    if (!isValidItemRow(row, descricao)) {
      continue;
    }

    itemsTotal++;

    const quantidade = parseQuantidade(get("quantidade"));
    const unidadeRaw = get("unidade");
    const { normalized: unidade, known: unidadeKnown } = normalizeUnidade(unidadeRaw);
    const precoRaw = get("preco_unitario");
    const preco_unitario = parsePrecoUnitario(precoRaw);
    const totalRaw = get("total");
    let total = totalRaw ? parsePrecoUnitario(totalRaw) : 0;
    if (!total && quantidade && preco_unitario) {
      total = quantidade * preco_unitario;
    }
    const prazo_entrega = get("prazo_entrega");
    const prazoNum = prazo_entrega ? parseQuantidade(prazo_entrega) : null;
    const impostosRaw = get("impostos_inclusos");
    const impostos_inclusos = impostosRaw !== "" ? toBoolean(impostosRaw) : null;
    const freteRaw = get("frete_incluso");
    const frete_incluso = freteRaw !== "" ? toBoolean(freteRaw) : null;
    const fornecedor = get("fornecedor") || normalizedSource;

    const itemWarnings = [];
    let itemValid = true;

    if (quantidade <= 0) {
      itemWarnings.push(`Quantidade inválida (${get("quantidade")})`);
      itemValid = false;
      needsReview = true;
    }
    if (!unidadeKnown && unidadeRaw) {
      itemWarnings.push(`Unidade normalizada de '${unidadeRaw}' para '${unidade}'`);
    }
    if (preco_unitario <= 0) {
      itemWarnings.push(`Preço unitário inválido ou ausente`);
      itemValid = false;
      needsReview = true;
    }

    if (itemWarnings.length > 0) {
      itemsWithWarnings++;
    }

    if (!itemValid) {
      itemsInvalid++;
    }

    items.push({
      row: r + 1,
      descricao,
      quantidade,
      unidade,
      preco_unitario,
      total,
      prazo_entrega: prazoNum,
      impostos_inclusos,
      frete_incluso,
      fornecedor,
      warnings: itemWarnings,
    });
  }

  const unmappedFields = expectedFields.filter((f) => !mappingOutput[f] || mappingOutput[f].confidence === 0);
  if (unmappedFields.length > 0) {
    reviewReasons.push(
      `${unmappedFields.length} coluna(s) não mapeada(s): ${unmappedFields.join(", ")}`
    );
    needsReview = true;
  }

  if (items.length === 0) {
    warnings.push("Nenhum item válido encontrado após o cabeçalho.");
    needsReview = true;
    reviewReasons.push("Nenhum item válido encontrado após o cabeçalho.");
  }

  let bestSupplier = null;
  let bestTotal = Infinity;
  const supplierTotals = {};

  for (const item of items) {
    const supplier = item.fornecedor || normalizedSource;
    if (!supplierTotals[supplier]) {
      supplierTotals[supplier] = { total: 0, items: 0, avgPrice: 0 };
    }
    if (item.total > 0) {
      supplierTotals[supplier].total += item.total;
      supplierTotals[supplier].items += 1;
    }
  }

  for (const [supplier, stats] of Object.entries(supplierTotals)) {
    if (stats.items > 0) {
      stats.avgPrice = stats.total / stats.items;
    }
    if (stats.total > 0 && stats.total < bestTotal) {
      bestTotal = stats.total;
      bestSupplier = supplier;
    }
  }

  if (!bestSupplier && normalizedSource !== "unknown") {
    bestSupplier = normalizedSource;
  } else if (!bestSupplier) {
    bestSupplier = items.length > 0 ? (items[0].fornecedor || "N/A") : "N/A";
  }

  return {
    status: "success",
    service: "rfq-parser",
    rfq_id: rfqId,
    source: normalizedSource,
    sheet: {
      name: sheetName,
      header_row: headerRowIndex + 1,
      total_rows: rows.length,
    },
    mapping: mappingOutput,
    items,
    summary: {
      items_total: itemsTotal,
      items_parsed: items.length,
      items_with_warnings: itemsWithWarnings,
      items_invalid: itemsInvalid,
      needs_review: needsReview,
      review_reasons: reviewReasons.length > 0 ? reviewReasons : null,
      best_supplier: bestSupplier,
      supplier_totals: Object.keys(supplierTotals).length > 1 ? supplierTotals : null,
    },
    warnings: warnings.length > 0 ? warnings : [],
    errors: errors,
  };
}

/**
 * Fluxo completo: download + pipeline (parse + validação + comparação + canônico v2).
 */
async function parseRfqFromUrl(fileUrl, rfqId, source = "") {
  const buffer = await downloadExcel(fileUrl);
  const { parseWithPipeline } = require("./pipeline");
  return parseWithPipeline(buffer, rfqId, source);
}

module.exports = {
  downloadExcel,
  readBestSheet,
  selectBestSheet: require("./io/readWorkbook").selectBestSheet,
  parseExcelToCanonical,
  parseRfqFromUrl,
  DOWNLOAD_TIMEOUT_MS,
  cellValue,
  isValidItemRow,
  toNumber,
};
