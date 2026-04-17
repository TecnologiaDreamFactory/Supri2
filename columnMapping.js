/**
 * Mapeamento canônico de colunas RFQ (OpenAI API).
 * Fuzzy matching: "Qtd", "Quantidade", "Qtde" → quantidade
 */

const { SYNONYMS } = require("./config/aliases");

const CANONICAL_FIELDS = [
  "descricao",
  "quantidade",
  "unidade",
  "preco_unitario",
  "fornecedor",
];

/** Unidades aceitas e padronizadas (saída canônica) */
const UNIDADES_PADRAO = {
  un: "UN",
  unid: "UN",
  unidade: "UN",
  und: "UN",
  "u.m.": "UN",
  "u.m": "UN",
  unit: "UN",
  cx: "CX",
  caixa: "CX",
  caixas: "CX",
  kg: "KG",
  kilograma: "KG",
  kilogramas: "KG",
  kilo: "KG",
  g: "KG", // tratado como KG para simplificar; pode ser aviso
  diária: "DIÁRIA",
  diaria: "DIÁRIA",
  dia: "DIÁRIA",
  "dias": "DIÁRIA",
  mensal: "DIÁRIA", // opcional: mapear para outro código se quiser
  m2: "M²",
  metro: "M²",
  metros: "M²",
  l: "L",
  lt: "L",
  litro: "L",
  litros: "L",
  pç: "PC",
  pc: "PC",
  peça: "PC",
  pecas: "PC",
  pct: "PCT",
  pacote: "PCT",
  pacotes: "PCT",
};

/**
 * Remove acentos e normaliza para comparação.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  if (typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Calcula similaridade simples (quanto do nome do header "bate" com algum sinônimo).
 * Retorna 0 a 1: 1 = match exato ou substring forte.
 * Prioriza matches que começam com a palavra-chave (mais específicos).
 */
function similarity(headerNorm, synonyms) {
  if (!headerNorm) return 0;
  let bestScore = 0;
  
  for (const syn of synonyms) {
    const s = normalize(syn);
    
    // Match exato
    if (headerNorm === s) return 1;
    
    // Match quando header começa com sinônimo (mais específico - prioridade alta)
    if (headerNorm.startsWith(s)) {
      const score = s.length / headerNorm.length;
      if (score > bestScore) bestScore = score;
      continue;
    }
    
    // Match quando sinônimo começa com header (também específico)
    if (s.startsWith(headerNorm)) {
      const score = headerNorm.length / s.length;
      if (score > bestScore) bestScore = score;
      continue;
    }
    
    // Match por substring (menos específico - prioridade baixa)
    if (headerNorm.includes(s) || s.includes(headerNorm)) {
      const len = Math.min(headerNorm.length, s.length);
      const maxLen = Math.max(headerNorm.length, s.length);
      const score = len / maxLen;
      // Penalizar matches por substring se não começar com a palavra-chave
      const penalizedScore = score * 0.7;
      if (penalizedScore > bestScore) bestScore = penalizedScore;
    }
  }
  
  return bestScore;
}

/**
 * Mapeia um nome de coluna do Excel para o campo canônico e retorna confiança.
 * @param {string} headerCell - Valor da célula de cabeçalho
 * @returns {{ field: string | null, confidence: number }}
 */
function mapHeaderToCanonical(headerCell) {
  const norm = normalize(String(headerCell || "").trim());
  if (!norm) return { field: null, confidence: 0 };

  let best = { field: null, confidence: 0 };
  for (const [field, synonyms] of Object.entries(SYNONYMS)) {
    const conf = similarity(norm, synonyms);
    if (conf > best.confidence) {
      best = { field, confidence: conf };
    }
  }
  return best;
}

/**
 * Dado um array de valores de uma linha de cabeçalho, retorna o mapeamento
 * colIndex -> { field, confidence } e a linha que foi usada (0-based).
 * @param {string[][]} rows - Primeiras N linhas da planilha (array de arrays)
 * @param {number} maxRowsToTry - Quantas linhas tentar como cabeçalho (ex.: 10)
 * @returns {{ mapping: Record<number, { field: string, confidence: number }>, headerRowIndex: number, score: number }}
 */
function detectHeaderAndMapping(rows, maxRowsToTry = 10) {
  let best = { mapping: {}, headerRowIndex: 0, score: 0 };

  for (let r = 0; r < Math.min(rows.length, maxRowsToTry); r++) {
    const row = rows[r] || [];
    const mapping = {};
    let matched = 0;
    let totalConf = 0;

    for (let c = 0; c < row.length; c++) {
      const { field, confidence } = mapHeaderToCanonical(row[c]);
      if (field && confidence > 0.3) {
        mapping[c] = { field, confidence };
        matched++;
        totalConf += confidence;
      }
    }

    // Exigir pelo menos descricao e (quantidade ou preco) para considerar como cabeçalho
    const hasDesc = Object.values(mapping).some((m) => m.field === "descricao");
    const hasQtyOrPrice =
      Object.values(mapping).some((m) => m.field === "quantidade") ||
      Object.values(mapping).some((m) => m.field === "preco_unitario");
    const score = hasDesc && hasQtyOrPrice ? matched * 2 + totalConf : 0;

    if (score > best.score) {
      best = { mapping, headerRowIndex: r, score };
    }
  }

  return best;
}

/**
 * Padroniza unidade para o modelo canônico (UN/CX/KG/DIÁRIA ou mantém se conhecida).
 * @param {string} value
 * @returns {{ normalized: string, known: boolean }}
 */
function normalizeUnidade(value) {
  const v = normalize(String(value || "").trim());
  if (!v) return { normalized: "UN", known: false };
  if (UNIDADES_PADRAO[v] !== undefined) {
    return { normalized: UNIDADES_PADRAO[v], known: true };
  }
  // Manter valor original mas marcar como não padronizado
  const upper = String(value).trim().toUpperCase();
  return { normalized: upper || "UN", known: false };
}

module.exports = {
  CANONICAL_FIELDS,
  SYNONYMS,
  UNIDADES_PADRAO,
  normalize,
  mapHeaderToCanonical,
  detectHeaderAndMapping,
  normalizeUnidade,
};
