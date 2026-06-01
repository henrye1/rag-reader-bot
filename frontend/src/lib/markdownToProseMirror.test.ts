// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { markdownToProseMirror } from "./markdownToProseMirror";

describe("markdownToProseMirror", () => {
  it("converts a heading and a paragraph", () => {
    const doc = markdownToProseMirror("## Title\n\nHello world");
    expect(doc.type).toBe("doc");
    const types = doc.content.map((n) => n.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
  });

  it("converts a bullet list", () => {
    const doc = markdownToProseMirror("- one\n- two");
    expect(doc.content.some((n) => n.type === "bulletList")).toBe(true);
  });

  it("converts a table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const doc = markdownToProseMirror(md);
    expect(doc.content.some((n) => n.type === "table")).toBe(true);
  });

  it("never throws on empty input", () => {
    expect(markdownToProseMirror("").type).toBe("doc");
  });
});
