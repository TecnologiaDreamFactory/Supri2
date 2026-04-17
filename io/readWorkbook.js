/**
 * Leitura de workbook Excel → grid 2D e seleção de aba.
 */

const XLSX = require("xlsx");

/**
 * @param {import('xlsx').WorkBook} workbook
 * @returns {{ sheet: import('xlsx').WorkSheet, sheetName: string }}
 */
function selectBestSheet(workbook) {
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error("Planilha Excel sem abas.");
  }

  const priorityNames = ["ITENS_COTACAO", "ITENS", "COTACAO", "COTAÇÃO", "ITEMS", "QUOTATION"];
  for (const priority of priorityNames) {
    const found = sheetNames.find((name) => {
      const nameUpper = name.toUpperCase();
      return nameUpper.includes(priority) || nameUpper.replace(/_/g, "").includes(priority.replace(/_/g, ""));
    });
    if (found) {
      return { sheet: workbook.Sheets[found], sheetName: found };
    }
  }

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const rowCount = range.e.r - range.s.r + 1;
    if (rowCount > 10) {
      return { sheet, sheetName };
    }
  }

  return { sheet: workbook.Sheets[sheetNames[0]], sheetName: sheetNames[0] };
}

/**
 * @param {Buffer} buffer
 * @returns {{ sheetName: string, rows: string[][], workbook: import('xlsx').WorkBook }}
 */
function readBestSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const { sheet, sheetName } = selectBestSheet(workbook);
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy",
  });
  return { sheetName, rows, workbook };
}

/**
 * @param {Buffer} buffer
 * @returns {{ sheetName: string, rows: string[][] }}
 */
function readBufferToGrid(buffer) {
  const { sheetName, rows } = readBestSheet(buffer);
  return { sheetName, rows };
}

/**
 * Leitura com merges (!merges) para parsers que precisam de células mescladas (ex.: nome do fornecedor).
 * @param {Buffer} buffer
 * @returns {{ sheetName: string, rows: string[][], merges: import('xlsx').Range[], sheet: import('xlsx').WorkSheet }}
 */
function readBestSheetWithMerges(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const { sheet, sheetName } = selectBestSheet(workbook);
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy",
  });
  const merges = sheet["!merges"] || [];
  return { sheetName, rows, merges, sheet };
}

/**
 * Valor exibido na célula (resolve merge: célula vazia usa canto superior esquerdo da região mesclada).
 * @param {number} r 0-based
 * @param {number} c 0-based
 * @param {string[][]} rows
 * @param {import('xlsx').Range[]} merges
 * @returns {string}
 */
function getCellDisplayValue(r, c, rows, merges) {
  const row = rows[r];
  let v = row && row[c];
  if (v !== undefined && v !== null && String(v).trim() !== "") {
    return String(v).trim();
  }
  for (const m of merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      const top = rows[m.s.r]?.[m.s.c];
      return top !== undefined && top !== null ? String(top).trim() : "";
    }
  }
  return "";
}

module.exports = {
  selectBestSheet,
  readBestSheet,
  readBufferToGrid,
  readBestSheetWithMerges,
  getCellDisplayValue,
};
