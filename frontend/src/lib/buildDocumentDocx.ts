import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AssessmentDocument, PMNode, Section } from "./documentTypes";

const HEADING_BY_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function inlineRuns(node: PMNode): TextRun[] {
  if (!node.content)
    return node.text != null ? [new TextRun(node.text)] : [];
  return node.content
    .filter((n) => n.type === "text")
    .map(
      (n) =>
        new TextRun({
          text: n.text ?? "",
          bold: n.marks?.some((m) => m.type === "bold"),
          italics: n.marks?.some((m) => m.type === "italic"),
        })
    );
}

function paragraphsFromCell(cell: PMNode): Paragraph[] {
  return (cell.content ?? []).map(
    (p) => new Paragraph({ children: inlineRuns(p) })
  );
}

function tableFromNode(node: PMNode): Table {
  const rows = (node.content ?? []).map(
    (row) =>
      new TableRow({
        children: (row.content ?? []).map(
          (cell) => new TableCell({ children: paragraphsFromCell(cell) })
        ),
      })
  );
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function listParagraphs(node: PMNode, ordered: boolean): Paragraph[] {
  return (node.content ?? []).map((li) => {
    const firstPara = (li.content ?? [])[0] ?? {
      type: "paragraph",
      content: [],
    };
    return new Paragraph({
      children: inlineRuns(firstPara),
      ...(ordered
        ? { numbering: { reference: "doc-numbering", level: 0 } }
        : { bullet: { level: 0 } }),
    });
  });
}

function nodeToElements(node: PMNode): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading":
      return [
        new Paragraph({
          children: inlineRuns(node),
          heading:
            HEADING_BY_LEVEL[(node.attrs?.level as number) ?? 2],
        }),
      ];
    case "paragraph":
      return [new Paragraph({ children: inlineRuns(node) })];
    case "bulletList":
      return listParagraphs(node, false);
    case "orderedList":
      return listParagraphs(node, true);
    case "table":
      return [tableFromNode(node)];
    default:
      return [];
  }
}

/** Map sections (with ProseMirror bodies) to a flat list of docx block elements. */
export function sectionsToDocxChildren(
  sections: Section[]
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const section of sections) {
    children.push(
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 })
    );
    if (section.kind === "structured") {
      if (section.status)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Status: ${section.status}`,
                italics: true,
              }),
            ],
          })
        );
      if (section.requirement)
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Requirement: ${section.requirement}` }),
            ],
          })
        );
    }
    for (const node of section.bodyJson.content ?? [])
      children.push(...nodeToElements(node));
  }
  return children;
}

/** Build and trigger a Word download for the whole document. */
export async function downloadDocumentDocx(
  doc: AssessmentDocument
): Promise<void> {
  const cover: Paragraph[] = [
    new Paragraph({
      text: doc.title || "Assessment",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: [doc.entity, doc.reportingDate].filter(Boolean).join(" — "),
        }),
      ],
    }),
  ];
  const docxDoc = new Document({
    numbering: {
      config: [
        {
          reference: "doc-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [{ children: [...cover, ...sectionsToDocxChildren(doc.sections)] }],
  });
  const blob = await Packer.toBlob(docxDoc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(doc.title || "assessment").replace(/\s+/g, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
