/**
 * Testes do pipeline de parse + validação + comparação.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const XLSX = require("xlsx");

const { parseWithPipeline } = require("../rfq/pipeline");
const { parsePrecoUnitario } = require("../rfq/normalize/money");
const { validateLegacyResult } = require("../rfq/validate/rules");
const { compareSuppliersFromLegacy } = require("../rfq/compare/rank");

describe("normalize/money", () => {
  it("parsePrecoUnitario BR", () => {
    assert.strictEqual(parsePrecoUnitario("R$ 2.800,00"), 2800);
    assert.strictEqual(parsePrecoUnitario(100), 100);
  });
});

describe("validateLegacyResult", () => {
  it("aceita resultado success mínimo", () => {
    const legacy = {
      status: "success",
      source: "A",
      items: [
        {
          descricao: "X",
          quantidade: 1,
          preco_unitario: 10,
          total: 10,
          fornecedor: "A",
        },
      ],
      summary: { supplier_totals: null },
      mapping: { descricao: { confidence: 1 }, quantidade: { confidence: 1 }, preco_unitario: { confidence: 1 } },
      warnings: [],
    };
    const v = validateLegacyResult(legacy);
    assert.strictEqual(v.ok, true);
  });
});

describe("compareSuppliersFromLegacy", () => {
  it("ranking com dois fornecedores", () => {
    const legacy = {
      status: "success",
      source: "unknown",
      items: [],
      summary: {
        supplier_totals: {
          FornecedorBarato: { total: 100, items: 2, avgPrice: 50 },
          FornecedorCaro: { total: 200, items: 2, avgPrice: 100 },
        },
        best_supplier: "FornecedorBarato",
      },
    };
    const c = compareSuppliersFromLegacy(legacy, { warnings: [] });
    assert.strictEqual(c.ranking[0].supplier_key, c.winner_suggested.supplier_key);
    assert.strictEqual(c.winner_suggested.name, "FornecedorBarato");
  });
});

describe("parseWithPipeline integração mínima", () => {
  it("monta xlsx em memória e retorna parser_version 2", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Produto", "Qtd", "UN", "Preço Unit", "Total"],
      ["Item teste", 2, "UN", "10,00", "20,00"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ITENS_COTACAO");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const out = await parseWithPipeline(buf, "RFQ-TEST", "FornecedorX", { skipOpenAI: true });
    assert.strictEqual(out.parser_version, 2);
    assert.strictEqual(out.status, "success");
    assert.ok(out.canonical_quotation);
    assert.ok(out.validation_result);
    assert.ok(out.comparison_result);
    assert.strictEqual(out.analysis_source, "deterministic");
  });
});
