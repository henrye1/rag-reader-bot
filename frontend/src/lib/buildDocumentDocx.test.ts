import { describe, it, expect } from "vitest";
import { sectionsToDocxChildren } from "./buildDocumentDocx";
import type { Section } from "./documentTypes";

const section: Section = {
  id: "s1",
  title: "Staging",
  kind: "structured",
  status: "Partially Compliant",
  requirement: "Stage per SICR.",
  origin: "assessment",
  bodyJson: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Methodology" }] },
      { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
      { type: "table", content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "v" }] }] }] },
      ] },
    ],
  },
};

describe("sectionsToDocxChildren", () => {
  it("produces docx elements without throwing", () => {
    const children = sectionsToDocxChildren([section]);
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);
  });

  it("includes a Table element for table nodes", () => {
    const children = sectionsToDocxChildren([section]);
    const hasTable = children.some((c) => c?.constructor?.name === "Table");
    expect(hasTable).toBe(true);
  });
});
