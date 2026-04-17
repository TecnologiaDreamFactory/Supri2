/**
 * Orquestra parse legado + validação + comparação + canônico v2 + OpenAI opcional.
 */

const { parseExcelToCanonical } = require("./parser");
const { validateLegacyResult } = require("./validate/rules");
const { compareSuppliersFromLegacy } = require("./compare/rank");
const {
  buildCanonicalV2FromLegacy,
  buildCanonicalV2FromGrouped,
} = require("./normalize/canonical");
const { detectTemplate } = require("./templates/router");
const { parseGroupedBlocks } = require("./templates/groupedBlocksParser");
const { getOpenAIConfig, isOpenAIConfigured } = require("../ai/openaiConfig");
const {
  resolveAmbiguousMapping,
  generateAnalyticSummary,
  shouldAttemptAmbiguityResolution,
  buildDoubts,
} = require("../ai/openaiClient");
const { buildAmbiguityPayload, buildAnalyticSummaryPayload } = require("../ai/openaiPayloads");

/**
 * Confiança heurística 0..1 a partir do mapping legado.
 * @param {object} legacy
 * @returns {number}
 */
function computeParsingConfidence(legacy) {
  if (!legacy || legacy.status !== "success") return 0;
  const m = legacy.mapping || {};
  const fields = ["descricao", "quantidade", "preco_unitario"];
  let sum = 0;
  let n = 0;
  for (const f of fields) {
    const c = m[f]?.confidence;
    if (typeof c === "number") {
      sum += c;
      n += 1;
    }
  }
  return n ? Math.min(1, sum / n) : 0;
}

/**
 * @param {Buffer} buffer
 * @param {string} rfqId
 * @param {string} [source]
 * @param {{ skipOpenAI?: boolean }} [options]
 * @returns {Promise<object>}
 */
async function parseWithPipeline(buffer, rfqId, source = "", options = {}) {
  const templateInfo = detectTemplate(buffer);
  let legacy;
  let groupedResult = null;

  const tryGroupedFirst = templateInfo.template_type === "grouped_suppliers";
  if (tryGroupedFirst) {
    const g = parseGroupedBlocks(buffer, rfqId, source);
    if (g.ok && g.legacy && g.legacy.status === "success") {
      legacy = g.legacy;
      groupedResult = g;
    }
  }

  if (!legacy || legacy.status !== "success") {
    legacy = parseExcelToCanonical(buffer, rfqId, source);
  }

  if (legacy.status !== "success" && legacy.errors?.some((e) => e.code === "NO_HEADER")) {
    const g = parseGroupedBlocks(buffer, rfqId, source);
    if (g.ok && g.legacy && g.legacy.status === "success") {
      legacy = g.legacy;
      groupedResult = g;
      templateInfo.template_type = "grouped_suppliers";
      templateInfo.alerts = [
        ...(templateInfo.alerts || []),
        "Layout agrupado detectado após falha do parser linha a linha.",
      ];
    }
  }

  if (tryGroupedFirst && !groupedResult && legacy.status === "success") {
    templateInfo.alerts = [
      ...(templateInfo.alerts || []),
      "Parser agrupado não aplicado; resultado do modo linha a linha.",
    ];
  }

  const base = {
    parser_version: 2,
    template_detection: templateInfo,
  };

  if (legacy.status !== "success") {
    return {
      ...legacy,
      ...base,
      canonical_quotation: null,
      validation_result: null,
      comparison_result: null,
      analysis_source: "deterministic",
      manual_review_required: true,
      analytic_summary: null,
      openai_ambiguity_advisory: null,
      openai_confidence: null,
      warnings: [],
    };
  }

  let parsingConfidence;
  let parsingAlerts;

  if (groupedResult) {
    parsingConfidence = groupedResult.parsing_confidence ?? 0.8;
    parsingAlerts = [...(groupedResult.parsing_alerts || []), ...(legacy.warnings || [])];
  } else {
    parsingConfidence = computeParsingConfidence(legacy);
    parsingAlerts = [...(legacy.warnings || [])];
  }

  const validation = validateLegacyResult(legacy);
  parsingAlerts = [
    ...parsingAlerts,
    ...validation.warnings.map((w) =>
      typeof w === "string" ? w : w.message || w.code || JSON.stringify(w)
    ),
  ];

  const comparison = compareSuppliersFromLegacy(legacy, validation);

  let canonical_quotation = groupedResult
    ? buildCanonicalV2FromGrouped(legacy, groupedResult)
    : buildCanonicalV2FromLegacy(legacy, parsingConfidence, parsingAlerts);

  const ocfg = getOpenAIConfig();
  const threshold = ocfg.parsingConfidenceThreshold;

  let analysis_source = "deterministic";
  let openai_ambiguity_advisory = null;
  let analytic_summary = null;
  let openai_confidence = null;
  const openaiWarnings = [];

  const skipOpenAI = Boolean(options.skipOpenAI);

  let ambiguitySucceeded = false;
  let summarySucceeded = false;

  if (!skipOpenAI) {
    const valWarnings = validation.warnings || [];
    const attemptAmbiguity = shouldAttemptAmbiguityResolution(
      parsingConfidence,
      parsingAlerts,
      valWarnings
    );

    if (attemptAmbiguity) {
      const doubts = buildDoubts(parsingConfidence, threshold, parsingAlerts);
      const ambPayload = buildAmbiguityPayload({
        template_type: templateInfo.template_type,
        template_detection: templateInfo,
        parsing_confidence: parsingConfidence,
        parsing_alerts: parsingAlerts,
        legacy,
        groupedResult,
        buffer,
        doubts,
      });

      try {
        const amb = await resolveAmbiguousMapping(ambPayload);
        if (amb) {
          openai_ambiguity_advisory = amb;
          ambiguitySucceeded = true;
          if (typeof amb.confidence === "number") {
            openai_confidence = amb.confidence;
          }
        } else if (getOpenAIConfig().enableAmbiguity && isOpenAIConfigured()) {
          openaiWarnings.push("openai_ambiguity_resolution_failed_or_skipped");
        }
      } catch {
        openaiWarnings.push("openai_ambiguity_resolution_exception");
      }
    }

    const summaryPayload = buildAnalyticSummaryPayload({
      canonical_quotation,
      validation_result: validation,
      comparison_result: comparison,
      legacy_summary: legacy.summary,
    });

    try {
      const sum = await generateAnalyticSummary(summaryPayload);
      if (sum) {
        analytic_summary = sum;
        summarySucceeded = true;
        if (typeof sum.confidence === "number") {
          openai_confidence =
            openai_confidence != null
              ? Math.min(1, (openai_confidence + sum.confidence) / 2)
              : sum.confidence;
        }
      } else if (getOpenAIConfig().enableSummary && isOpenAIConfigured()) {
        openaiWarnings.push("openai_analytic_summary_failed_or_skipped");
      }
    } catch {
      openaiWarnings.push("openai_analytic_summary_exception");
    }

    if (ambiguitySucceeded && summarySucceeded) {
      analysis_source = "hybrid";
    } else if (ambiguitySucceeded) {
      analysis_source = "hybrid";
    } else if (summarySucceeded) {
      analysis_source = "openai";
    }
  }

  const manual_review_required =
    Boolean(legacy.summary?.needs_review) ||
    !validation.ok ||
    Boolean(analytic_summary?.manual_review_required) ||
    (openai_ambiguity_advisory &&
      openai_ambiguity_advisory.resolved === false &&
      (openai_ambiguity_advisory.confidence ?? 1) < 0.5);

  const warnings = [...parsingAlerts, ...openaiWarnings];

  return {
    ...legacy,
    ...base,
    canonical_quotation,
    validation_result: validation,
    comparison_result: comparison,
    parsing_confidence_snapshot: parsingConfidence,
    analysis_source,
    manual_review_required,
    analytic_summary,
    openai_ambiguity_advisory,
    openai_confidence,
    warnings,
  };
}

module.exports = {
  parseWithPipeline,
  computeParsingConfidence,
};
