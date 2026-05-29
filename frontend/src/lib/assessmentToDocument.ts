import type { Assessment, Topic, MethodologyItem } from "./assessmentTypes";
import type { Section, PMNode, ProseMirrorDoc } from "./documentTypes";

let counter = 0;
const id = () => `sec-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const text = (s: string, marks?: PMNode["marks"]): PMNode =>
  ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const para = (children: PMNode[]): PMNode => ({ type: "paragraph", content: children });
const heading = (level: number, s: string): PMNode =>
  ({ type: "heading", attrs: { level }, content: [text(s)] });

const bulletList = (items: string[]): PMNode => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [para([text(t)])],
  })),
});

const tableNode = (headers: string[] | undefined, rows: string[][]): PMNode => {
  const headerRow: PMNode | null = headers && headers.length
    ? { type: "tableRow", content: headers.map((h) => ({ type: "tableHeader", content: [para([text(h)])] })) }
    : null;
  const bodyRows: PMNode[] = rows.map((r) => ({
    type: "tableRow",
    content: r.map((c) => ({ type: "tableCell", content: [para([text(String(c))])] })),
  }));
  return { type: "table", content: headerRow ? [headerRow, ...bodyRows] : bodyRows };
};

function methodologyToNodes(items: MethodologyItem[]): PMNode[] {
  const nodes: PMNode[] = [];
  const pendingBullets: string[] = [];
  const flush = () => {
    if (pendingBullets.length) { nodes.push(bulletList([...pendingBullets])); pendingBullets.length = 0; }
  };
  for (const item of items) {
    if (item.type === "bullet") {
      pendingBullets.push(item.cite ? `${item.text} [${item.cite}]` : item.text);
    } else if (item.type === "note") {
      flush();
      nodes.push(para([text(item.text, [{ type: "italic" }])]));
    } else if (item.type === "table") {
      flush();
      if (item.caption) nodes.push(para([text(item.caption, [{ type: "bold" }])]));
      nodes.push(tableNode(item.headers, item.rows));
    }
  }
  flush();
  return nodes;
}

function topicToSection(topic: Topic): Section {
  const body: PMNode[] = [];
  if (topic.methodology?.length) {
    body.push(heading(3, "Methodology"));
    body.push(...methodologyToNodes(topic.methodology));
  }
  if (topic.modelPerformance?.length) {
    body.push(heading(3, "Model performance"));
    body.push(bulletList(topic.modelPerformance));
  }
  if (topic.gaps?.length) {
    body.push(heading(3, "Gaps"));
    body.push(bulletList(topic.gaps));
  }
  if (topic.actions?.length) {
    body.push(heading(3, "Actions"));
    body.push(bulletList(topic.actions.map((a) => `${a.text} (${a.prio})`)));
  }
  return {
    id: id(),
    title: topic.title,
    kind: "structured",
    status: topic.status,
    requirement: topic.requirement,
    bodyJson: { type: "doc", content: body.length ? body : [para([])] },
    origin: "assessment",
  };
}

function contextSection(a: Assessment): Section {
  const ctx = a.documentContext ?? {};
  const rows: string[][] = Object.entries(ctx)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => [k, String(v)]);
  const body: PMNode[] = rows.length
    ? [tableNode(["Field", "Value"], rows)]
    : [para([text("No document context captured.")])];
  return { id: id(), title: "Document Context", kind: "generic", bodyJson: { type: "doc", content: body }, origin: "assessment" };
}

function summarySection(a: Assessment): Section {
  const s = a.summary ?? {};
  const body: PMNode[] = [];
  if (s.headline) body.push(para([text(s.headline)]));
  if (s.priorities?.length) { body.push(heading(3, "Priorities")); body.push(bulletList(s.priorities)); }
  if (!body.length) body.push(para([text("No summary provided.")]));
  return { id: id(), title: "Summary", kind: "generic", bodyJson: { type: "doc", content: body }, origin: "assessment" };
}

/** Convert a parsed Assessment into seeded document sections. */
export function assessmentToSections(a: Assessment): Section[] {
  return [contextSection(a), ...(a.topics ?? []).map(topicToSection), summarySection(a)];
}

export const newGenericDoc = (): ProseMirrorDoc => ({ type: "doc", content: [{ type: "paragraph" }] });
