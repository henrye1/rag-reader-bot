/**
 * Build a Word document from an Assessment object.
 *
 * Returns a Blob suitable for browser download via FileSaver.saveAs or a
 * direct anchor download. Browser-compatible — uses the `docx` npm package
 * which works in Vite/Webpack browser bundles.
 *
 * Styling matches the V3-Complete reference: navy/blue working paper with
 * cover page, document control table, table of contents, RAG status pills,
 * priority badges, and verbatim table reproductions.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  LevelFormat,
  TabStopType,
  TabStopPosition,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  PageBreak,
  HeadingLevel,
  TableOfContents,
} from "docx";
import type {
  Assessment,
  ComplianceStatus,
  DocumentContext,
  MethodologyItem,
  Priority,
  Summary,
  Topic,
} from "./assessmentTypes";

// ---------------------------------------------------------------------------
// Design tokens (sync with references/output_format.md Section 4)
// ---------------------------------------------------------------------------
const C = {
  navy: "1F3864",
  blue: "2E75B6",
  blueLight: "D9E2F3",
  grey: "595959",
  greyLight: "D9D9D9",
  greyBg: "F2F2F2",
  black: "000000",
  white: "FFFFFF",
  ragGreen: "548235",
  ragGreenBg: "E2EFDA",
  ragAmber: "BF8F00",
  ragAmberBg: "FFF2CC",
  ragRed: "C00000",
  ragRedBg: "FBE5D6",
};
const FONT = "Calibri";
const CW = 9360; // content width DXA (US Letter, 1" margins)

const thin = { style: BorderStyle.SINGLE, size: 4, color: C.greyLight };
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };
const cellPad = { top: 100, bottom: 100, left: 140, right: 140 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type ParaOpts = {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  size?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  spacing?: { before?: number; after?: number };
};

const makePara = (text: string, opts: ParaOpts = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts.size ?? 20,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? C.black,
      }),
    ],
  });

const P = (text: string, opts: ParaOpts = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: opts.spacing ?? { before: 60, after: 60 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts.size ?? 22,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? C.black,
      }),
    ],
  });

const H1 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [
      new TextRun({ text, font: FONT, size: 30, bold: true, color: C.navy }),
    ],
  });

const H2 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [
      new TextRun({ text, font: FONT, size: 26, bold: true, color: C.navy }),
    ],
  });

const H3 = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text, font: FONT, size: 22, bold: true, color: C.blue }),
    ],
  });

const bullet = (text: string) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });

const numbered = (text: string) =>
  new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });

const spacer = (s = 120) =>
  new Paragraph({
    spacing: { before: s, after: 0 },
    children: [new TextRun({ text: "", font: FONT })],
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const cite = (text: string) =>
  new Paragraph({
    spacing: { before: 0, after: 60 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 16,
        italics: true,
        color: C.grey,
      }),
    ],
  });

type CellOpts = ParaOpts & {
  width: number;
  shading?: string;
  valign?: (typeof VerticalAlign)[keyof typeof VerticalAlign];
};

const cell = (text: string | Paragraph[] | string[], opts: CellOpts) => {
  const paras: Paragraph[] = Array.isArray(text)
    ? (text as Array<string | Paragraph>).map((t) =>
        typeof t === "string" ? makePara(t, opts) : t,
      )
    : [makePara(text as string, opts)];
  return new TableCell({
    borders: cellBorders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shading
      ? { fill: opts.shading, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: cellPad,
    verticalAlign: opts.valign ?? VerticalAlign.CENTER,
    children: paras,
  });
};

function statusKey(status: ComplianceStatus): "GREEN" | "AMBER" | "RED" | "GREY" {
  if (status === "Compliant") return "GREEN";
  if (status === "Partially Compliant") return "AMBER";
  if (status === "Non-Compliant") return "RED";
  return "GREY";
}

const ragShading = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? C.ragGreenBg : k === "AMBER" ? C.ragAmberBg : k === "RED" ? C.ragRedBg : C.greyLight;
const ragColor = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? C.ragGreen : k === "AMBER" ? C.ragAmber : k === "RED" ? C.ragRed : C.grey;
const statusIcon = (k: ReturnType<typeof statusKey>) =>
  k === "GREEN" ? "✅ " : k === "AMBER" ? "⚠️ " : k === "RED" ? "❌ " : "";
const prioColor = (p: Priority) =>
  p === "High" ? C.ragRed : p === "Medium" ? C.ragAmber : C.ragGreen;
const prioBg = (p: Priority) =>
  p === "High" ? C.ragRedBg : p === "Medium" ? C.ragAmberBg : C.ragGreenBg;

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------
function coverPage(a: Assessment): Paragraph[] {
  const dc: [string, string][] = [
    ["Document Title", `IFRS 9 ECL Compliance Assessment — ${a.title || a.entity || "Working Paper"}`],
    ["Entity", a.entity || "Not stated"],
    ["Reporting Date Assessed", a.reportingDate || "Not stated"],
    ["Source Documents", (a.sourceDocuments || []).join("\n")],
    ["Date Issued", new Date().toISOString().slice(0, 10)],
    ["Prepared by", a.preparedBy || "[Name] — Credit Risk Assessor"],
    ["Reviewed by", a.reviewedBy || "[Name] — Senior Manager"],
    ["Approved by", a.approvedBy || "[Name] — Head of Risk"],
  ];
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 2400, after: 0 },
      children: [new TextRun({ text: "", font: FONT })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: C.navy, space: 1 } },
      children: [new TextRun({ text: "", font: FONT })],
    }),
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [new TextRun({ text: "INTERNAL WORKING PAPER", font: FONT, size: 22, bold: true, color: C.blue })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "IFRS 9 Compliance Assessment", font: FONT, size: 48, bold: true, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: a.title || a.entity || "ECL Methodology Review", font: FONT, size: 32, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.blue, space: 1 } },
      children: [new TextRun({ text: "", font: FONT })],
    }),
    P("Document Control", { size: 24, bold: true, color: C.navy }),
  ];
  out.push(
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [2600, 6760],
      rows: dc.map((row, idx) =>
        new TableRow({
          children: [
            cell(row[0], { width: 2600, shading: idx % 2 === 0 ? C.greyBg : C.white, bold: true, color: C.navy }),
            cell(row[1].split("\n").map((l) => makePara(l)), { width: 6760, shading: idx % 2 === 0 ? C.white : C.greyBg }),
          ],
        }),
      ),
    }) as unknown as Paragraph,
  );
  out.push(spacer(240));
  out.push(P("Confidentiality", { size: 22, bold: true, color: C.navy }));
  out.push(P("This document is an internal working paper. It contains confidential information and is intended only for the parties identified above.", { size: 20, italics: true, color: C.grey }));
  out.push(pageBreak());
  return out;
}

// ---------------------------------------------------------------------------
// Document context block
// ---------------------------------------------------------------------------
function documentContextSection(ctx: DocumentContext | undefined): Paragraph[] {
  const c = ctx || {};
  const rows: [string, string][] = [
    ["Entity", c.entity || "Not stated in corpus"],
    ["Jurisdiction / Regulator", c.jurisdiction || "Not stated in corpus"],
    ["Portfolio Type", c.portfolioType || "Not stated in corpus"],
    ["Reporting Currency", c.currency || "Not stated in corpus"],
    ["Reporting Date Assessed", c.reportingDate || "Not stated in corpus"],
    ["Total Gross Exposure", c.totalGrossExposure || "Not stated in corpus"],
    ["Total Provision / ECL", c.totalProvision || "Not stated in corpus"],
  ];
  const out: Paragraph[] = [
    H1("1. Pre-Response Document Context"),
    P("Produced once per assessment per Stage 0 of the workflow. All values are verbatim from source where stated."),
    spacer(80),
  ];
  out.push(
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [3000, 6360],
      rows: rows.map((row, idx) =>
        new TableRow({
          children: [
            cell(row[0], { width: 3000, shading: idx % 2 === 0 ? C.greyBg : C.white, bold: true, color: C.navy }),
            cell(row[1].split("\n").map((l) => makePara(l)), { width: 6360, shading: idx % 2 === 0 ? C.white : C.greyBg }),
          ],
        }),
      ),
    }) as unknown as Paragraph,
  );

  if (c.coverageRatios) {
    out.push(spacer(160));
    out.push(H2("1.1 Coverage Ratios"));
    const cr = c.coverageRatios;
    out.push(
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({
            tableHeader: true,
            children: ["Stage 1", "Stage 2", "Stage 3", "Overall"].map((h) =>
              cell(h, { width: 2340, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER }),
            ),
          }),
          new TableRow({
            children: [
              cell(cr.stage1 || "—", { width: 2340, align: AlignmentType.CENTER, bold: true }),
              cell(cr.stage2 || "—", { width: 2340, align: AlignmentType.CENTER, bold: true }),
              cell(cr.stage3 || "—", { width: 2340, align: AlignmentType.CENTER, bold: true }),
              cell(cr.overall || "—", { width: 2340, align: AlignmentType.CENTER, bold: true, shading: C.blueLight }),
            ],
          }),
        ],
      }) as unknown as Paragraph,
    );
  }

  if (c.provisionBySegment?.length) {
    out.push(spacer(160));
    out.push(H2("1.2 Provision Split by Portfolio Segment"));
    c.provisionBySegment.forEach((p) => out.push(bullet(`${p[0]}: ${p[1]}`)));
  }

  if (c.peerBenchmark?.present && c.peerBenchmark.peers?.length) {
    out.push(spacer(160));
    out.push(H2("1.3 Peer Benchmark — Verbatim from Source"));
    const ncols = c.peerBenchmark.peers[0].length;
    const headers = ["Bank", "As-of", "Stage 1", "Stage 2", "Stage 3", "Total"].slice(0, ncols);
    const colw = Math.floor(CW / ncols);
    out.push(
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: new Array(ncols).fill(colw),
        rows: [
          new TableRow({
            tableHeader: true,
            children: headers.map((h) => cell(h, { width: colw, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER })),
          }),
          ...c.peerBenchmark.peers.map((r) =>
            new TableRow({
              children: r.map((v, i) =>
                cell(String(v), { width: colw, align: AlignmentType.CENTER, bold: i === 0 }),
              ),
            }),
          ),
        ],
      }) as unknown as Paragraph,
    );
  }

  if (c.priorReviews?.length) {
    out.push(spacer(160));
    out.push(H2("1.4 Prior External Reviews"));
    c.priorReviews.forEach((r) => out.push(bullet(r)));
  }

  if (c.modelMetrics?.length) {
    out.push(spacer(160));
    out.push(H2("1.5 Model Performance Metrics — Verbatim from Source"));
    out.push(
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [5000, 4360],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell("Metric", { width: 5000, shading: C.navy, color: C.white, bold: true }),
              cell("Value", { width: 4360, shading: C.navy, color: C.white, bold: true }),
            ],
          }),
          ...c.modelMetrics.map((m) =>
            new TableRow({
              children: [
                cell(m[0], { width: 5000, bold: true }),
                cell(String(m[1]), { width: 4360 }),
              ],
            }),
          ),
        ],
      }) as unknown as Paragraph,
    );
  }

  if (c.tablesObserved?.length) {
    out.push(spacer(160));
    out.push(H2("1.6 Material Tables Observed in Source"));
    c.tablesObserved.forEach((t) => out.push(bullet(t)));
  }

  if (c.knownInconsistencies?.length) {
    out.push(spacer(160));
    out.push(H2("1.7 Known Inconsistencies / Open Items"));
    c.knownInconsistencies.forEach((i) => out.push(bullet(i)));
  }

  out.push(pageBreak());
  return out;
}

// ---------------------------------------------------------------------------
// Topic block
// ---------------------------------------------------------------------------
function topicBlock(t: Topic): Paragraph[] {
  const k = statusKey(t.status);
  const out: Paragraph[] = [
    H1(`${t.num}. ${t.title}`),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [2400, 6960],
      rows: [
        new TableRow({
          children: [
            cell("COMPLIANCE STATUS", { width: 2400, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER }),
            cell(`${statusIcon(k)}${t.status}`, { width: 6960, shading: ragShading(k), color: ragColor(k), bold: true, align: AlignmentType.CENTER }),
          ],
        }),
      ],
    }) as unknown as Paragraph,
    spacer(160),
    H3("IFRS 9 Requirement"),
    P(t.requirement || "Not stated."),
    H3("Client Methodology"),
  ];

  (t.methodology || []).forEach((m: MethodologyItem) => {
    if (m.type === "bullet") {
      out.push(bullet(m.text));
      if (m.cite) out.push(cite(m.cite));
    } else if (m.type === "table") {
      out.push(spacer(80));
      if (m.caption) out.push(P(m.caption, { size: 20, bold: true, color: C.navy }));
      const ncols = m.headers ? m.headers.length : m.rows[0]?.length || 0;
      const colw = Math.floor(CW / Math.max(ncols, 1));
      out.push(
        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: new Array(ncols).fill(colw),
          rows: [
            ...(m.headers
              ? [
                  new TableRow({
                    tableHeader: true,
                    children: m.headers.map((h) =>
                      cell(String(h), { width: colw, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER }),
                    ),
                  }),
                ]
              : []),
            ...(m.rows || []).map(
              (r) =>
                new TableRow({
                  children: r.map((v) =>
                    cell(String(v), { width: colw, align: AlignmentType.CENTER }),
                  ),
                }),
            ),
          ],
        }) as unknown as Paragraph,
      );
      out.push(spacer(80));
    } else if (m.type === "note") {
      out.push(P(m.text, { size: 20, italics: true, color: C.grey }));
    }
  });

  if (t.modelPerformance?.length) {
    out.push(H3("Model Performance / Data Quality Commentary"));
    t.modelPerformance.forEach((p) => out.push(bullet(p)));
  }

  out.push(H3("Key Gaps"));
  if (!t.gaps?.length) out.push(P("None identified."));
  else t.gaps.forEach((g) => out.push(numbered(g)));

  out.push(H3("Recommended Actions"));
  if (!t.actions?.length) {
    out.push(P("None identified."));
  } else {
    out.push(
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [600, 7400, 1360],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell("#", { width: 600, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER }),
              cell("Action", { width: 7400, shading: C.navy, color: C.white, bold: true }),
              cell("Priority", { width: 1360, shading: C.navy, color: C.white, bold: true, align: AlignmentType.CENTER }),
            ],
          }),
          ...t.actions.map((a, i) =>
            new TableRow({
              children: [
                cell(String(i + 1), { width: 600, align: AlignmentType.CENTER, bold: true, color: C.navy }),
                cell(a.text, { width: 7400 }),
                cell(a.prio, { width: 1360, align: AlignmentType.CENTER, bold: true, color: prioColor(a.prio), shading: prioBg(a.prio) }),
              ],
            }),
          ),
        ],
      }) as unknown as Paragraph,
    );
  }

  if (t.coverage) {
    out.push(spacer(80));
    out.push(
      new Paragraph({
        spacing: { before: 80, after: 0 },
        children: [
          new TextRun({
            text: "Source coverage: " + t.coverage,
            font: FONT,
            size: 16,
            italics: true,
            color: C.grey,
          }),
        ],
      }),
    );
  }
  out.push(pageBreak());
  return out;
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
function finalSummary(s: Summary | undefined): Paragraph[] {
  if (!s) return [];
  const c = s.counts || {};
  const out: Paragraph[] = [
    H1("Final Summary Dashboard"),
    P("Overall compliance picture across the assessed topics:"),
    spacer(80),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell("Compliant", { width: 2340, shading: C.ragGreen, color: C.white, bold: true, align: AlignmentType.CENTER }),
            cell("Partially Compliant", { width: 2340, shading: C.ragAmber, color: C.white, bold: true, align: AlignmentType.CENTER }),
            cell("Non-Compliant", { width: 2340, shading: C.ragRed, color: C.white, bold: true, align: AlignmentType.CENTER }),
            cell("Evidence Not Found", { width: 2340, shading: C.grey, color: C.white, bold: true, align: AlignmentType.CENTER }),
          ],
        }),
        new TableRow({
          children: [
            cell(String(c.compliant || 0), { width: 2340, align: AlignmentType.CENTER, bold: true, color: C.ragGreen, shading: C.ragGreenBg }),
            cell(String(c.partial || 0), { width: 2340, align: AlignmentType.CENTER, bold: true, color: C.ragAmber, shading: C.ragAmberBg }),
            cell(String(c.nonCompliant || 0), { width: 2340, align: AlignmentType.CENTER, bold: true, color: C.ragRed, shading: C.ragRedBg }),
            cell(String(c.evidenceNotFound || 0), { width: 2340, align: AlignmentType.CENTER, bold: true, color: C.grey, shading: C.greyLight }),
          ],
        }),
      ],
    }) as unknown as Paragraph,
    spacer(240),
  ];

  if (s.headline) {
    out.push(H2("Headline Conclusion"));
    out.push(P(s.headline));
  }
  if (s.priorities?.length) {
    out.push(H2("Top Remediation Priorities"));
    s.priorities.forEach((p) => out.push(numbered(p)));
  }
  if (s.sequencing) {
    out.push(H2("Suggested Sequencing"));
    if (s.sequencing.shortTerm) out.push(bullet(`0–3 months: ${s.sequencing.shortTerm}`));
    if (s.sequencing.mediumTerm) out.push(bullet(`3–9 months: ${s.sequencing.mediumTerm}`));
    if (s.sequencing.longTerm) out.push(bullet(`9–18 months: ${s.sequencing.longTerm}`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// MAIN ENTRY
// ---------------------------------------------------------------------------
export async function buildAssessmentDocx(a: Assessment): Promise<Blob> {
  const titleText = `IFRS 9 ECL Assessment — ${a.title || a.entity || "Working Paper"}`;
  const doc = new Document({
    creator: "IFRS 9 Assessment",
    title: titleText,
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: FONT, color: C.navy }, paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: FONT, color: C.navy }, paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: FONT, color: C.blue }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.blue, space: 4 } },
                children: [
                  new TextRun({ text: titleText, font: FONT, size: 18, bold: true, color: C.navy }),
                  new TextRun({ text: "\t" }),
                  new TextRun({ text: "Internal Working Paper", font: FONT, size: 18, italics: true, color: C.grey }),
                ],
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                border: { top: { style: BorderStyle.SINGLE, size: 8, color: C.blue, space: 4 } },
                children: [
                  new TextRun({ text: "Confidential — Internal Working Paper", font: FONT, size: 18, italics: true, color: C.grey }),
                  new TextRun({ text: "\tPage ", font: FONT, size: 18, color: C.grey }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: C.grey }),
                  new TextRun({ text: " of ", font: FONT, size: 18, color: C.grey }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: C.grey }),
                ],
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              }),
            ],
          }),
        },
        children: [
          ...coverPage(a),
          H1("Table of Contents"),
          new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
          pageBreak(),
          ...documentContextSection(a.documentContext),
          ...(a.topics || []).flatMap((t) => topicBlock(t)),
          ...finalSummary(a.summary),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Convenience: build the docx and trigger a browser download.
 */
export async function downloadAssessmentDocx(a: Assessment, filename?: string) {
  const blob = await buildAssessmentDocx(a);
  const name = filename ||
    `${(a.entity || "Assessment").replace(/[^A-Za-z0-9]+/g, "_")}_IFRS9_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.docx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
