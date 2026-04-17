/**
 * Validação estrutural mínima das respostas JSON da OpenAI.
 */

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * @param {unknown} data
 * @returns {{ ok: boolean, value?: object }}
 */
function validateAmbiguityResponse(data) {
  if (!isPlainObject(data)) return { ok: false };
  if (typeof data.resolved !== "boolean") return { ok: false };
  if (typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
    return { ok: false };
  }
  if (!isPlainObject(data.suggested_mapping)) return { ok: false };
  if (!Array.isArray(data.suggested_mapping.supplier_blocks)) return { ok: false };
  if (!isPlainObject(data.suggested_mapping.special_rows)) return { ok: false };
  if (!Array.isArray(data.suggested_mapping.notes)) return { ok: false };
  if (!Array.isArray(data.warnings)) return { ok: false };
  if (typeof data.rationale !== "string") return { ok: false };
  return { ok: true, value: data };
}

/**
 * @param {unknown} data
 * @returns {{ ok: boolean, value?: object }}
 */
function validateAnalyticSummaryResponse(data) {
  if (!isPlainObject(data)) return { ok: false };
  if (typeof data.winner_summary !== "string") return { ok: false };
  if (!Array.isArray(data.ranking_summary)) return { ok: false };
  if (!Array.isArray(data.key_alerts)) return { ok: false };
  if (typeof data.manual_review_required !== "boolean") return { ok: false };
  if (typeof data.concise_reasoning !== "string") return { ok: false };
  if (typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
    return { ok: false };
  }
  return { ok: true, value: data };
}

/**
 * Equivalência semântica de itens (batch).
 * @param {unknown} data
 * @returns {{ ok: boolean, value?: object }}
 */
function validateSemanticEquivalenceResponse(data) {
  if (!isPlainObject(data)) return { ok: false };
  if (typeof data.equivalent !== "boolean") return { ok: false };
  if (typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
    return { ok: false };
  }
  if (typeof data.manual_review_required !== "boolean") return { ok: false };
  if (typeof data.reason !== "string") return { ok: false };
  if (!Array.isArray(data.matched_attributes)) return { ok: false };
  if (!Array.isArray(data.differences)) return { ok: false };
  if (!Array.isArray(data.risk_flags)) return { ok: false };
  if (data.matched_candidate_item_key != null && typeof data.matched_candidate_item_key !== "string") {
    return { ok: false };
  }
  return { ok: true, value: data };
}

module.exports = {
  validateAmbiguityResponse,
  validateAnalyticSummaryResponse,
  validateSemanticEquivalenceResponse,
};
