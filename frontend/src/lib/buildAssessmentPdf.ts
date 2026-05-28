/**
 * Build a PDF from an Assessment object using pdfmake.
 *
 * Returns a Promise<Blob> for download. pdfmake works in browsers via Vite —
 * import the fonts from `pdfmake/build/vfs_fonts` (the default Roboto pack
 * is fine for working-paper output).
 *
 * Styling mirrors the docx builder: navy/blue working paper with cover page,
 * document control, document context, RAG status pills (colour-coded),
 * priority badges, verbatim table reproductions.
 */
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type {
  Assessment,
  ComplianceStatus,
  DocumentContext,
  MethodologyItem,
  Priority,
  Summary,
  Topic,
} from "./assessmentTypes";

// pdfmake VFS setup (Vite-friendly)
// Different versions of pdfmake expose the VFS differently — handle both.
(pdfMake as unknown as { vfs: unknown }).vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ||
  (pdfFonts as unknown as { vfs?: unknown }).vfs;

// Design tokens (hex strings without leading #)
const C = {
  navy: "#1F3864",
  blue: "#2E75B6",
  blueLight: "#D9E2F3",
  grey: "#595959",
  greyLight: "#D9D9D9",
  greyBg: "#F2F2F2",
  white: "#FFFFFF",
  ragGreen: "#548235",
  ragGreenBg: "#E2EFDA",
  ragAmber: "#BF8F00",
  ragAmberBg: "#FFF2CC",
  ragRed: "#C00000",
  ragRedBg: "#FBE5D6",
};

type Content = Record<string, unknown> | string;

function statusKey(status: ComplianceStatus): "GREEN" | "AMBER" | "RED" | "GREY" {
  if (status === "Compliant") return "GREEN";
  if (status === "Partially Compliant") return "AMBER";
  if (status === "Non-Compliant") return "RED";
  return "GREY";
}
const ragColor = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? C.ragGreen : k === "AMBER" ? C.ragAmber : k === "RED" ? C.ragRed : C.grey;
const ragShading = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? C.ragGreenBg : k === "AMBER" ? C.ragAmberBg : k === "RED" ? C.ragRedBg : C.greyLight;
const statusIcon = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? "✅ " : k === "AMBER" ? "⚠️ " : k === "RED" ? "❌ " : "";
const prioColor = (p: Priority) =>
  p === "High" ? C.ragRed : p === "Medium" ? C.ragAmber : C.ragGreen;
const prioBg = (p: Priority) =>
  p === "High" ? C.ragRedBg : p === "Medium" ? C.ragAmberBg : C.ragGreenBg;

const H = (text: string, level: 1 | 2 | 3 = 1) => ({
  text,
  style: `h${level}`,
  margin: level === 1 ? [0, 16, 0, 8] : level === 2 ? [0, 12, 0, 6] : [0, 8, 0, 4],
});

const P = (text: string, opts: Record<string, unknown> = {}) => ({
  text,
  ...opts,
  margin: opts.margin || [0, 3, 0, 3],
});

// Simple key/value table used for Document Control and Document Context.
function kvTable(rows: [string, string][], leftWidth = 130) {
  return {
    table: {
      widths: [leftWidth, "*"],
      body: rows.map((r, idx) => [
        { text: r[0], bold: true, color: C.navy, fillColor: idx % 2 === 0 ? C.greyBg : C.white },
        { text: r[1], fillColor: idx % 2 === 0 ? C.white : C.greyBg },
      ]),
    },
    layout: {
      hLineColor: () => C.greyLight,
      vLineColor: () => C.greyLight,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 4, 0, 8],
  };
}

function coverContent(a: Assessment): Content[] {
  return [
    { text: "", margin: [0, 80, 0, 0] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 4, lineColor: C.navy }] },
    { text: "INTERNAL WORKING PAPER", color: C.blue, bold: true, fontSize: 12, margin: [0, 12, 0, 6] },
    { text: "IFRS 9 Compliance Assessment", color: C.navy, bold: true, fontSize: 28, margin: [0, 0, 0, 4] },
    { text: a.title || a.entity || "ECL Methodology Review", color: C.navy, fontSize: 18, margin: [0, 0, 0, 18] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: C.blue }] },
    { text: "Document Control", bold: true, color: C.navy, fontSize: 14, margin: [0, 18, 0, 8] },
    kvTable(
      [
        ["Document Title", `IFRS 9 ECL Compliance Assessment — ${a.title || a.entity || "Working Paper"}`],
        ["Entity", a.entity || "Not stated"],
        ["Reporting Date Assessed", a.reportingDate || "Not stated"],
        ["Source Documents", (a.sourceDocuments || []).join("\n")],
        ["Date Issued", new Date().toISOString().slice(0, 10)],
        ["Prepared by", a.preparedBy || "[Name] — Credit Risk Assessor"],
        ["Reviewed by", a.reviewedBy || "[Name] — Senior Manager"],
        ["Approved by", a.approvedBy || "[Name] — Head of Risk"],
      ],
      150,
    ),
    { text: "Confidentiality", bold: true, color: C.navy, fontSize: 12, margin: [0, 14, 0, 4] },
    { text: "This document is an internal working paper. It contains confidential information and is intended only for the parties identified above.", italics: true, color: C.grey },
    { text: "", pageBreak: "after" },
  ];
}

function contextContent(ctx: DocumentContext | undefined): Content[] {
  const c = ctx || {};
  const out: Content[] = [H("1. Pre-Response Document Context", 1)];
  out.push(P("Produced once per assessment per Stage 0 of the workflow. All values are verbatim from source where stated."));
  out.push(
    kvTable(
      [
        ["Entity", c.entity || "Not stated in corpus"],
        ["Jurisdiction / Regulator", c.jurisdiction || "Not stated in corpus"],
        ["Portfolio Type", c.portfolioType || "Not stated in corpus"],
        ["Reporting Currency", c.currency || "Not stated in corpus"],
        ["Reporting Date Assessed", c.reportingDate || "Not stated in corpus"],
        ["Total Gross Exposure", c.totalGrossExposure || "Not stated in corpus"],
        ["Total Provision / ECL", c.totalProvision || "Not stated in corpus"],
      ],
      150,
    ),
  );

  if (c.coverageRatios) {
    out.push(H("1.1 Coverage Ratios", 2));
    const cr = c.coverageRatios;
    out.push({
      table: {
        widths: ["*", "*", "*", "*"],
        body: [
          [
            { text: "Stage 1", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
            { text: "Stage 2", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
            { text: "Stage 3", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
            { text: "Overall", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
          ],
          [
            { text: cr.stage1 || "—", alignment: "center", bold: true },
            { text: cr.stage2 || "—", alignment: "center", bold: true },
            { text: cr.stage3 || "—", alignment: "center", bold: true },
            { text: cr.overall || "—", alignment: "center", bold: true, fillColor: C.blueLight },
          ],
        ],
      },
      layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      margin: [0, 4, 0, 8],
    });
  }

  if (c.provisionBySegment?.length) {
    out.push(H("1.2 Provision Split by Portfolio Segment", 2));
    out.push({ ul: c.provisionBySegment.map((p) => `${p[0]}: ${p[1]}`) });
  }

  if (c.peerBenchmark?.present && c.peerBenchmark.peers?.length) {
    out.push(H("1.3 Peer Benchmark — Verbatim from Source", 2));
    const ncols = c.peerBenchmark.peers[0].length;
    const headers = ["Bank", "As-of", "Stage 1", "Stage 2", "Stage 3", "Total"].slice(0, ncols);
    out.push({
      table: {
        widths: new Array(ncols).fill("*"),
        body: [
          headers.map((h) => ({ text: h, fillColor: C.navy, color: C.white, bold: true, alignment: "center" })),
          ...c.peerBenchmark.peers.map((r) =>
            r.map((v, i) => ({ text: String(v), alignment: "center", bold: i === 0 })),
          ),
        ],
      },
      layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      margin: [0, 4, 0, 8],
    });
  }

  if (c.priorReviews?.length) {
    out.push(H("1.4 Prior External Reviews", 2));
    out.push({ ul: c.priorReviews });
  }

  if (c.modelMetrics?.length) {
    out.push(H("1.5 Model Performance Metrics — Verbatim from Source", 2));
    out.push({
      table: {
        widths: ["*", "*"],
        body: [
          [
            { text: "Metric", fillColor: C.navy, color: C.white, bold: true },
            { text: "Value", fillColor: C.navy, color: C.white, bold: true },
          ],
          ...c.modelMetrics.map((m) => [{ text: m[0], bold: true }, { text: String(m[1]) }]),
        ],
      },
      layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      margin: [0, 4, 0, 8],
    });
  }

  if (c.tablesObserved?.length) {
    out.push(H("1.6 Material Tables Observed in Source", 2));
    out.push({ ul: c.tablesObserved });
  }

  if (c.knownInconsistencies?.length) {
    out.push(H("1.7 Known Inconsistencies / Open Items", 2));
    out.push({ ul: c.knownInconsistencies });
  }

  out.push({ text: "", pageBreak: "after" });
  return out;
}

function topicBlock(t: Topic): Content[] {
  const k = statusKey(t.status);
  const out: Content[] = [H(`${t.num}. ${t.title}`, 1)];

  // Status pill
  out.push({
    table: {
      widths: [120, "*"],
      body: [
        [
          { text: "COMPLIANCE STATUS", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
          { text: `${statusIcon(k)}${t.status}`, fillColor: ragShading(k), color: ragColor(k), bold: true, alignment: "center" },
        ],
      ],
    },
    layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    margin: [0, 4, 0, 8],
  });

  out.push(H("IFRS 9 Requirement", 3));
  out.push(P(t.requirement || "Not stated."));

  out.push(H("Client Methodology", 3));
  (t.methodology || []).forEach((m: MethodologyItem) => {
    if (m.type === "bullet") {
      out.push({ ul: [m.text + (m.cite ? `\n   ${m.cite}` : "")], margin: [0, 2, 0, 2] });
    } else if (m.type === "table") {
      if (m.caption) out.push(P(m.caption, { bold: true, color: C.navy, margin: [0, 6, 0, 4] }));
      const ncols = m.headers?.length || m.rows[0]?.length || 0;
      out.push({
        table: {
          widths: new Array(ncols).fill("*"),
          body: [
            ...(m.headers
              ? [
                  m.headers.map((h) => ({
                    text: String(h),
                    fillColor: C.navy,
                    color: C.white,
                    bold: true,
                    alignment: "center",
                  })),
                ]
              : []),
            ...(m.rows || []).map((r) => r.map((v) => ({ text: String(v), alignment: "center" }))),
          ],
        },
        layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 4, 0, 8],
      });
    } else if (m.type === "note") {
      out.push(P(m.text, { italics: true, color: C.grey }));
    }
  });

  if (t.modelPerformance?.length) {
    out.push(H("Model Performance / Data Quality Commentary", 3));
    out.push({ ul: t.modelPerformance });
  }

  out.push(H("Key Gaps", 3));
  if (!t.gaps?.length) out.push(P("None identified."));
  else out.push({ ol: t.gaps });

  out.push(H("Recommended Actions", 3));
  if (!t.actions?.length) {
    out.push(P("None identified."));
  } else {
    out.push({
      table: {
        widths: [30, "*", 70],
        body: [
          [
            { text: "#", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
            { text: "Action", fillColor: C.navy, color: C.white, bold: true },
            { text: "Priority", fillColor: C.navy, color: C.white, bold: true, alignment: "center" },
          ],
          ...t.actions.map((a, i) => [
            { text: String(i + 1), alignment: "center", bold: true, color: C.navy },
            { text: a.text },
            { text: a.prio, alignment: "center", bold: true, color: prioColor(a.prio), fillColor: prioBg(a.prio) },
          ]),
        ],
      },
      layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      margin: [0, 4, 0, 8],
    });
  }

  if (t.coverage) {
    out.push(P(`Source coverage: ${t.coverage}`, { italics: true, color: C.grey, fontSize: 9, margin: [0, 6, 0, 0] }));
  }

  out.push({ text: "", pageBreak: "after" });
  return out;
}

function summaryContent(s: Summary | undefined): Content[] {
  if (!s) return [];
  const c = s.counts || {};
  const out: Content[] = [H("Final Summary Dashboard", 1)];
  out.push(P("Overall compliance picture across the assessed topics:"));
  out.push({
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [
          { text: "Compliant", fillColor: C.ragGreen, color: C.white, bold: true, alignment: "center" },
          { text: "Partially Compliant", fillColor: C.ragAmber, color: C.white, bold: true, alignment: "center" },
          { text: "Non-Compliant", fillColor: C.ragRed, color: C.white, bold: true, alignment: "center" },
          { text: "Evidence Not Found", fillColor: C.grey, color: C.white, bold: true, alignment: "center" },
        ],
        [
          { text: String(c.compliant || 0), alignment: "center", bold: true, color: C.ragGreen, fillColor: C.ragGreenBg },
          { text: String(c.partial || 0), alignment: "center", bold: true, color: C.ragAmber, fillColor: C.ragAmberBg },
          { text: String(c.nonCompliant || 0), alignment: "center", bold: true, color: C.ragRed, fillColor: C.ragRedBg },
          { text: String(c.evidenceNotFound || 0), alignment: "center", bold: true, color: C.grey, fillColor: C.greyLight },
        ],
      ],
    },
    layout: { hLineColor: () => C.greyLight, vLineColor: () => C.greyLight, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    margin: [0, 4, 0, 12],
  });
  if (s.headline) {
    out.push(H("Headline Conclusion", 2));
    out.push(P(s.headline));
  }
  if (s.priorities?.length) {
    out.push(H("Top Remediation Priorities", 2));
    out.push({ ol: s.priorities });
  }
  if (s.sequencing) {
    out.push(H("Suggested Sequencing", 2));
    const seq: string[] = [];
    if (s.sequencing.shortTerm) seq.push(`0–3 months: ${s.sequencing.shortTerm}`);
    if (s.sequencing.mediumTerm) seq.push(`3–9 months: ${s.sequencing.mediumTerm}`);
    if (s.sequencing.longTerm) seq.push(`9–18 months: ${s.sequencing.longTerm}`);
    out.push({ ul: seq });
  }
  return out;
}

export async function buildAssessmentPdf(a: Assessment): Promise<Blob> {
  const titleText = `IFRS 9 ECL Assessment — ${a.title || a.entity || "Working Paper"}`;
  const docDefinition = {
    pageSize: "LETTER",
    pageMargins: [50, 60, 50, 60],
    info: { title: titleText, author: "IFRS 9 Assessment" },
    header: (currentPage: number) =>
      currentPage === 1
        ? undefined
        : {
            columns: [
              { text: titleText, color: C.navy, bold: true, fontSize: 9 },
              { text: "Internal Working Paper", italics: true, color: C.grey, fontSize: 9, alignment: "right" },
            ],
            margin: [50, 30, 50, 0],
          },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Confidential — Internal Working Paper", italics: true, color: C.grey, fontSize: 9 },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", color: C.grey, fontSize: 9 },
      ],
      margin: [50, 0, 50, 30],
    }),
    styles: {
      h1: { fontSize: 18, bold: true, color: C.navy },
      h2: { fontSize: 14, bold: true, color: C.navy },
      h3: { fontSize: 12, bold: true, color: C.blue },
    },
    defaultStyle: { fontSize: 10 },
    content: [
      ...coverContent(a),
      ...contextContent(a.documentContext),
      ...(a.topics || []).flatMap((t) => topicBlock(t)),
      ...summaryContent(a.summary),
    ],
  };

  return await new Promise<Blob>((resolve) => {
    const pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.getBlob((blob: Blob) => resolve(blob));
  });
}

/**
 * Convenience: build the PDF and trigger a browser download.
 */
export async function downloadAssessmentPdf(a: Assessment, filename?: string) {
  const blob = await buildAssessmentPdf(a);
  const name =
    filename ||
    `${(a.entity || "Assessment").replace(/[^A-Za-z0-9]+/g, "_")}_IFRS9_${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
