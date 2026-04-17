/**
 * Exporta planilha XLSX (exceljs) — schema em xlsxSchema.js
 * Apenas abas Condições Gerais e Inconsistências; dados neutros (sem vencedor/score).
 */

const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const {
  SHEETS,
  CONDICOES_GERAIS_COLUMNS,
  INCONSISTENCIAS_COLUMNS,
  NUMFMT_BRL,
  NUMFMT_PCT,
  FILL_INCONSISTENCIA_GRAVE,
  FILL_HEADER,
  FILL_BLOCKING,
} = require("./xlsxSchema");
const { parseExecutionSeconds } = require("./batchMetrics");
const { renderPieChart3dPng } = require("./pieChart3dPng");

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {string} campoLabel — coluna A
 * @param {string|number} valor — coluna B
 */
function setMetadataValorByCampo(ws, campoLabel, valor) {
  ws.eachRow((row) => {
    const a = row.getCell(1).value;
    if (a === campoLabel) {
      row.getCell(2).value = valor;
    }
  });
}

/** Alias legado (Resumo) — mesma semântica na aba Condições Gerais */
function setResumoValorByCampo(ws, campoLabel, valor) {
  return setMetadataValorByCampo(ws, campoLabel, valor);
}

/**
 * @param {import('exceljs').Worksheet} ws
 */
function upsertResumoRow(ws, campoLabel, valor) {
  let found = false;
  ws.eachRow((row) => {
    const a = row.getCell(1).value;
    if (a === campoLabel) {
      row.getCell(2).value = valor;
      found = true;
    }
  });
  if (!found) {
    ws.addRow([campoLabel, valor]);
  }
}

function buildMetricsStagesLine(st) {
  if (!st) return "—";
  const sem = st.semantic != null ? `${st.semantic}` : "—";
  return `parse=${st.parse ?? "—"}ms; consolidação=${st.consolidate ?? "—"}ms; semântico=${sem}ms; ranking=${st.rank ?? "—"}ms; openai=${st.openai ?? "—"}ms; revisão=${st.review_build ?? "—"}ms; export=${st.export ?? "—"}ms`;
}

function padRow8(cells) {
  const a = Array.isArray(cells) ? cells.slice() : [];
  while (a.length < 8) a.push(null);
  return a;
}

/**
 * @param {object} opts
 * @returns {Promise<{ exportMs: number, metrics_summary: object, export_generated_at: string, export_last_updated_at: string }>}
 */
async function exportBatchWorkbook(opts) {
  const tExportStart = Date.now();
  const {
    batchId: _batchId,
    createdAt: _createdAt,
    decision_status: _decision_status,
    metrics_summary,
    parsedFiles: _parsedFiles,
    consolidated: _consolidated,
    comparison_result: _comparison_result,
    inconsistencies,
    analytic_summary: _analytic_summary,
    allQuotes,
    review_summary: _review_summary,
    filePath,
    batchStartMs,
    artifactMeta = {},
    semantic_match_notes: _semantic_match_notes,
  } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "compras-dream-export-v2";
  wb.created = new Date();

  // --- Condições Gerais ---
  const wsCG = wb.addWorksheet(SHEETS.CONDICOES_GERAIS, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const cgHeaders = CONDICOES_GERAIS_COLUMNS.map((c) => c.header);
  const cgH = wsCG.addRow(cgHeaders);
  cgH.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } };
    cell.font = { bold: true };
  });
  wsCG.columns = CONDICOES_GERAIS_COLUMNS.map((c) => ({ width: c.width }));

  for (const q of allQuotes) {
    const row = wsCG.addRow([
      q.supplier_name,
      q.source_filename,
      q.freight_total,
      q.declared_total != null ? q.declared_total : "",
      q.recalculated_total,
      q.installments ? JSON.stringify(q.installments).slice(0, 120) : "",
      q.payment_terms ? JSON.stringify(q.payment_terms).slice(0, 120) : "",
      q.warnings.length,
    ]);
    const nfrete = 3;
    const ndecl = 4;
    const nrec = 5;
    row.getCell(nfrete).numFmt = NUMFMT_BRL;
    row.getCell(ndecl).numFmt = NUMFMT_BRL;
    row.getCell(nrec).numFmt = NUMFMT_BRL;
  }

  wsCG.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cgHeaders.length },
  };

  // --- Tabela percentual + gráfico ---
  wsCG.addRow(padRow8([]));
  const secTitle = wsCG.addRow(
    padRow8([
      "Distribuição percentual do total recalculado por proposta (dados)",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ])
  );
  secTitle.getCell(1).font = { bold: true };

  const distHeader = wsCG.addRow(padRow8(["Proposta", "Total recalculado (R$)", "% do total", null, null, null, null, null]));
  distHeader.getCell(1).font = { bold: true };
  distHeader.getCell(2).font = { bold: true };
  distHeader.getCell(3).font = { bold: true };

  let sumRec = 0;
  for (const q of allQuotes) {
    const t = typeof q.recalculated_total === "number" && q.recalculated_total > 0 ? q.recalculated_total : 0;
    sumRec += t;
  }

  const pieSlices = [];
  for (const q of allQuotes) {
    const t = typeof q.recalculated_total === "number" && q.recalculated_total > 0 ? q.recalculated_total : 0;
    const pct = sumRec > 0 ? t / sumRec : 0;
    const r = wsCG.addRow(padRow8([q.supplier_name || "—", t, pct, null, null, null, null, null]));
    r.getCell(2).numFmt = NUMFMT_BRL;
    r.getCell(3).numFmt = NUMFMT_PCT;
    if (t > 0) pieSlices.push({ label: String(q.supplier_name || "—"), value: t });
  }

  wsCG.addRow(padRow8([]));
  const chartTitle = wsCG.addRow(
    padRow8(["Gráfico (pizza 3D — visualização)", null, null, null, null, null, null, null])
  );
  chartTitle.getCell(1).font = { bold: true };

  const pngBuf = renderPieChart3dPng(pieSlices);
  if (pngBuf && pngBuf.length) {
    const imageId = wb.addImage({ buffer: pngBuf, extension: "png" });
    wsCG.addImage(imageId, {
      tl: { col: 0, row: wsCG.rowCount },
      ext: { width: 420, height: 315 },
    });
  }

  for (let i = 0; i < 6; i++) {
    wsCG.addRow(padRow8([]));
  }

  // --- Inconsistências ---
  const wsInc = wb.addWorksheet(SHEETS.INCONSISTENCIAS, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const incHeaders = INCONSISTENCIAS_COLUMNS.map((c) => c.header);
  const incH = wsInc.addRow(incHeaders);
  incH.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } };
    cell.font = { bold: true };
  });
  wsInc.columns = INCONSISTENCIAS_COLUMNS.map((c) => ({ width: c.width }));

  for (const inc of inconsistencies) {
    const sev = inc.severity || "";
    const r = wsInc.addRow([
      inc.file || "",
      inc.supplier || "",
      inc.type || inc.code || "",
      inc.detail || inc.message || "",
      sev,
    ]);
    if (sev === "blocking") {
      r.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: FILL_BLOCKING },
        };
      });
    } else if (sev === "error") {
      r.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: FILL_INCONSISTENCIA_GRAVE },
        };
      });
    }
  }
  wsInc.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: incHeaders.length },
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const exportMs = Date.now() - tExportStart;
  const batchStart = batchStartMs != null ? batchStartMs : tExportStart;
  const executionTime = `${((Date.now() - batchStart) / 1000).toFixed(2)}s`;
  const mergedMetrics = {
    ...metrics_summary,
    executionTime,
    execution_seconds: parseExecutionSeconds(executionTime),
    stage_timings_ms: {
      ...(metrics_summary && metrics_summary.stage_timings_ms ? metrics_summary.stage_timings_ms : {}),
      export: exportMs,
    },
  };
  const nowIso = new Date().toISOString();
  const genAt = artifactMeta.export_generated_at != null ? String(artifactMeta.export_generated_at) : nowIso;
  const updAt = artifactMeta.export_last_updated_at != null ? String(artifactMeta.export_last_updated_at) : nowIso;

  await wb.xlsx.writeFile(filePath);

  return {
    exportMs,
    metrics_summary: mergedMetrics,
    export_generated_at: genAt,
    export_last_updated_at: updAt,
  };
}

/**
 * Atualiza campos de decisão/export (colunas A/B) na aba Condições Gerais — insere linhas se ainda não existirem.
 */
async function patchBatchWorkbookMetadata(filePath, patch) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(SHEETS.CONDICOES_GERAIS);
  if (!ws) {
    throw new Error("aba Condições Gerais não encontrada");
  }
  const p = patch || {};
  if (p.decision_status != null) upsertResumoRow(ws, "decision_status", String(p.decision_status));
  if (p.decided_by != null) upsertResumoRow(ws, "decided_by", String(p.decided_by));
  if (p.decided_at != null) upsertResumoRow(ws, "decided_at", String(p.decided_at));
  if (p.decision_reason != null) upsertResumoRow(ws, "decision_reason", String(p.decision_reason));
  if (p.export_last_updated_at != null) {
    upsertResumoRow(ws, "export_last_updated_at", String(p.export_last_updated_at));
  }
  await wb.xlsx.writeFile(filePath);
}

async function exportBatchWorkbookFromSnapshot(snapshot, filePath, extra = {}) {
  if (!snapshot || !snapshot.batch_id) {
    throw new Error("snapshot inválido");
  }
  const metrics = snapshot.metrics_summary || {};
  return exportBatchWorkbook({
    batchId: snapshot.batch_id,
    createdAt: snapshot.created_at,
    decision_status: snapshot.decision_status,
    metrics_summary: metrics,
    parsedFiles: snapshot.parsed_files || [],
    consolidated: snapshot.consolidated,
    comparison_result: snapshot.comparison_result,
    inconsistencies: snapshot.inconsistencies || [],
    analytic_summary: snapshot.analytic_summary,
    allQuotes: snapshot.allQuotes || [],
    review_summary: snapshot.review_summary,
    semantic_match_notes: snapshot.semantic_match_notes || {},
    filePath,
    batchStartMs: extra.batchStartMs != null ? extra.batchStartMs : Date.now(),
    artifactMeta: {
      decided_by: extra.artifactMeta?.decided_by,
      decided_at: extra.artifactMeta?.decided_at,
      decision_reason: extra.artifactMeta?.decision_reason,
      export_generated_at: extra.artifactMeta?.export_generated_at,
      export_last_updated_at: extra.artifactMeta?.export_last_updated_at ?? new Date().toISOString(),
    },
  });
}

module.exports = {
  exportBatchWorkbook,
  patchBatchWorkbookMetadata,
  exportBatchWorkbookFromSnapshot,
  setResumoValorByCampo,
  setMetadataValorByCampo,
  upsertResumoRow,
  buildMetricsStagesLine,
};
