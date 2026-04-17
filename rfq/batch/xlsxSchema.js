/**
 * Schema estável do XLSX de exportação em lote (abas, ordem de colunas, headers).
 * Export simplificado: apenas Condições Gerais + Inconsistências (sem ranking/resumo comparativo).
 */

const SHEETS = {
  RESUMO: "Resumo",
  COMPARACAO: "Comparação",
  CONDICOES_GERAIS: "Condições Gerais",
  INCONSISTENCIAS: "Inconsistências",
};

/** Ordem das abas no export atual */
const SHEET_ORDER = [SHEETS.CONDICOES_GERAIS, SHEETS.INCONSISTENCIAS];

const RESUMO_COLUMNS = [
  { key: "campo", header: "Campo", width: 28 },
  { key: "valor", header: "Valor", width: 80 },
];

/** Base da aba Comparação (legado / testes antigos) */
const COMPARACAO_FIXED_COLUMNS = [
  { key: "item_key", header: "item_key", width: 36 },
  { key: "descricao_ref", header: "descrição referência", width: 42 },
  { key: "qtd_ref", header: "qtd referência", width: 14 },
];

const COMPARACAO_PROPOSAL_SUFFIXES = ["preço unit.", "total linha", "obs"];

/** Sem score (evita induzir escolha); avisos apenas como contagem factual */
const CONDICOES_GERAIS_COLUMNS = [
  { key: "fornecedor", header: "Fornecedor / proposta", width: 30 },
  { key: "arquivo_origem", header: "Arquivo origem", width: 36 },
  { key: "frete", header: "Frete", width: 14 },
  { key: "total_declarado", header: "Total declarado", width: 18 },
  { key: "total_recalculado", header: "Total recalculado", width: 18 },
  { key: "parcelamento", header: "Parcelamento", width: 28 },
  { key: "condicao_pagamento", header: "Condição pagamento", width: 28 },
  { key: "avisos_qtd", header: "Quantidade de avisos", width: 18 },
];

const INCONSISTENCIAS_COLUMNS = [
  { key: "arquivo", header: "Arquivo", width: 32 },
  { key: "fornecedor", header: "Fornecedor", width: 28 },
  { key: "tipo", header: "Tipo", width: 22 },
  { key: "detalhe", header: "Detalhe", width: 50 },
  { key: "severidade", header: "Severidade", width: 14 },
];

/** Moeda BRL (exceljs numFmt) */
const NUMFMT_BRL = "R$ #,##0.00";

const NUMFMT_PCT = "0.00%";

/** Cores ARGB (tema leve) */
const FILL_MIN_PRICE = "FFE8F5E9";
const FILL_INCONSISTENCIA_GRAVE = "FFFFEBEE";
const FILL_BLOCKING = "FFFFCDD2";
const FILL_HEADER = "FFF5F5F5";

module.exports = {
  SHEETS,
  SHEET_ORDER,
  RESUMO_COLUMNS,
  COMPARACAO_FIXED_COLUMNS,
  COMPARACAO_PROPOSAL_SUFFIXES,
  CONDICOES_GERAIS_COLUMNS,
  INCONSISTENCIAS_COLUMNS,
  NUMFMT_BRL,
  NUMFMT_PCT,
  FILL_MIN_PRICE,
  FILL_INCONSISTENCIA_GRAVE,
  FILL_BLOCKING,
  FILL_HEADER,
};
