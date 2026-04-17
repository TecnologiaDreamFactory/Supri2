/**
 * Extrai propostas (fornecedor) a partir do resultado do pipeline por arquivo.
 */

const { parsePrecoUnitario } = require("../normalize/money");
const { parseQuantidade } = require("../normalize/quantities");
const { slugKey } = require("../compare/rank");
const { buildItemKey, normalizeItemKeyDescription } = require("./itemKey");

/**
 * @typedef {object} QuoteLineItem
 * @property {string} item_key
 * @property {string} descricao
 * @property {number} quantidade
 * @property {string} [unidade]
 * @property {number} preco_unitario
 * @property {number} total
 * @property {number} [row]
 */

/** @deprecated Use normalizeItemKeyDescription — mantido para compat. */
function normalizeItemKey(desc) {
  return normalizeItemKeyDescription(desc);
}

/**
 * @param {object} pipelineResult - retorno parseWithPipeline
 * @param {{ source_filename: string, file_index: number }} meta
 * @returns {{ ok: boolean, error?: string, quotes: import('./batchTypes').SupplierQuote[] }}
 */
function extractSupplierQuotes(pipelineResult, meta) {
  const { source_filename, file_index } = meta;
  const quotes = [];

  if (!pipelineResult || pipelineResult.status !== "success") {
    const err =
      pipelineResult?.errors?.map((e) => e.message || e.code).join("; ") ||
      pipelineResult?.error ||
      "parse_failed";
    return { ok: false, error: String(err), quotes: [] };
  }

  const legacy = pipelineResult;
  const items = legacy.items || [];
  const summary = legacy.summary || {};
  const isGrouped = summary._template === "grouped_suppliers";

  const freightBy = summary.freight_by_supplier || {};
  const declaredRow = summary.declared_totals_row || {};
  const supplierTotals = summary.supplier_totals || {};
  const installments = summary.installments_raw ?? null;
  const paymentTerms = summary.payment_terms_raw ?? null;

  /** @type {Map<string, typeof items>} */
  const bySupplier = new Map();

  for (const it of items) {
    const sup = String(it.fornecedor || legacy.source || "unknown").trim() || "unknown";
    if (!bySupplier.has(sup)) bySupplier.set(sup, []);
    bySupplier.get(sup).push(it);
  }

  if (bySupplier.size === 0) {
    return { ok: false, error: "nenhum_item_parseado", quotes: [] };
  }

  for (const [supplierName, groupItems] of bySupplier.entries()) {
    /** Inclui file_index para unicidade quando o mesmo nome de arquivo aparece mais de uma vez. */
    const proposalLabel = `${supplierName} (${source_filename}) [${file_index}]`;
    /** Alinha com compareSuppliersFromLegacy (slug do nome exibido). */
    const proposalKey = slugKey(proposalLabel);

    /** @type {QuoteLineItem[]} */
    const lineItems = [];
    for (const it of groupItems) {
      const desc = String(it.descricao || "").trim();
      const unidade = it.unidade != null ? String(it.unidade).trim() : "";
      const itemKey = buildItemKey(it);
      lineItems.push({
        item_key: itemKey,
        descricao: desc,
        quantidade: parseQuantidade(it.quantidade),
        unidade: unidade || undefined,
        preco_unitario: parsePrecoUnitario(it.preco_unitario),
        total: parsePrecoUnitario(it.total),
        row: it.row,
      });
    }

    const freightTotal = parsePrecoUnitario(freightBy[supplierName]);
    let declared = declaredRow[supplierName];
    if (declared == null && supplierTotals[supplierName]) {
      declared = supplierTotals[supplierName].total;
    }
    if (declared != null) declared = parsePrecoUnitario(declared);

    const sumLines = lineItems.reduce((a, x) => a + (parsePrecoUnitario(x.total) || 0), 0);
    const recalculated = sumLines + freightTotal;

    const quoteWarnings = [];
    if (declared != null && Math.abs(declared - recalculated) > 0.05) {
      quoteWarnings.push(
        `Total declarado (${declared.toFixed(2)}) difere do recalculado (${recalculated.toFixed(2)})`
      );
    }

    const q = {
      proposal_key: proposalKey,
      proposal_label: proposalLabel,
      supplier_name: supplierName,
      source_filename,
      quotation_id: String(legacy.rfq_id || ""),
      file_index,
      items: lineItems,
      freight_total: freightTotal,
      declared_total: declared != null ? declared : null,
      recalculated_total: recalculated,
      installments: isGrouped ? installments : null,
      payment_terms: isGrouped ? paymentTerms : null,
      warnings: quoteWarnings,
    };
    quotes.push(q);
  }

  return { ok: true, quotes };
}

module.exports = {
  extractSupplierQuotes,
  normalizeItemKey,
};
