/**
 * Aliases centralizados para cabeçalhos e rótulos de linha (RFQ).
 * Usado por columnMapping e futuros parsers (grouped blocks).
 */

/** Sinônimos por campo canônico de coluna (minúsculo normalizado na comparação) */
const COLUMN_SYNONYMS = {
  descricao: [
    "descricao", "descrição", "description", "produto", "item", "material",
    "insumo", "nome", "nome do item", "especificação", "especificacao", "produto/serviço",
    "produto/servico", "produto / servico", "produto / serviço", "descrição do item",
    "descricao do item", "servico", "serviço", "id_item",
  ],
  quantidade: [
    "quantidade", "qtd", "qtde", "quantity", "quant", "qtd.", "qtde.",
    "qtd solicitada", "qtde solicitada", "quantidade solicitada", "qty",
  ],
  unidade: [
    "unidade", "un", "unid", "um", "unit", "un.", "unid.", "um.",
    "und", "unidade de medida", "medida", "u.m.", "u.m", "u.m.",
  ],
  preco_unitario: [
    "preco unit (fornecedor)", "preço unit (fornecedor)", "preco unitario (fornecedor)",
    "preco unitario", "preço unitário", "preco_unitario", "preço", "valor",
    "unit price", "valor unitário", "valor unitario", "r$ unit", "r$ unit.",
    "preco", "preço unit", "valor unit", "vl unit", "vl unitário", "preço/un",
    "preco/un", "preco por unidade", "preço por unidade", "vl. unit",
    "preco (r$) unit", "preço (r$) unit",
  ],
  total: [
    "total", "valor total", "preco total", "preço total", "subtotal", "vl total",
    "total (auto)",
  ],
  prazo_entrega: [
    "prazo", "lead time", "entrega", "prazo entrega", "prazo de entrega",
    "dias", "prazo (dias)", "prazo entrega (dias uteis)", "prazo entrega (dias úteis)",
  ],
  impostos_inclusos: [
    "impostos", "tributos", "iss", "icms", "imposto incluso", "impostos inclusos",
    "impostos inclusos?", "tax", "imposto incluso (s/n)",
  ],
  frete_incluso: [
    "frete", "entrega inclusa", "frete incluso", "frete incluso?",
    "shipping", "frete (s/n)",
  ],
  fornecedor: [
    "fornecedor", "fornecedor/razão social", "fornecedor/razao social",
    "razão social", "razao social", "vendor", "empresa", "nome do fornecedor",
    "fornecedor nome", "razão social do fornecedor",
  ],
};

/** Rótulos para identificar linhas especiais (primeira coluna ou descrição) */
const ROW_LABEL_SYNONYMS = {
  freight: [
    "frete", "transporte", "entrega", "valor frete", "vl frete", "shipping",
    "custos de envio", "envio",
  ],
  total: [
    "total", "total geral", "valor total geral", "total da proposta", "soma geral",
  ],
  installments: [
    "parcelamento", "parcelado em", "parcelas", "condicao parcelamento", "condição parcelamento",
    "pagamento parcelado",
  ],
  payment_terms: [
    "condicao de pgto", "condição de pgto", "cond. pagamento", "cond pagamento",
    "prazo pagamento", "forma de pagamento", "condicao pagamento", "condição pagamento",
    "pagamento",
  ],
};

/** Legado: SYNONYMS aponta para COLUMN_SYNONYMS (compatível com columnMapping) */
const SYNONYMS = COLUMN_SYNONYMS;

module.exports = {
  COLUMN_SYNONYMS,
  ROW_LABEL_SYNONYMS,
  SYNONYMS,
};
