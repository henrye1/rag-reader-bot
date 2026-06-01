// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { appendAnswerToSections } from "./appendToSection";
import type { Section } from "./documentTypes";

const sections: Section[] = [
  { id: "s1", title: "PD Models", kind: "generic", bodyJson: { type: "doc", content: [] }, origin: "assessment" },
];

describe("appendAnswerToSections", () => {
  it("appends a labeled block to an existing section", () => {
    const out = appendAnswerToSections(sections, { targetSectionId: "s1", sectionTitle: "PD Models", isNew: false }, "What is the LGD floor?", "The floor is 5%.");
    const body = out.find((s) => s.id === "s1")!.bodyJson.content;
    expect(body.some((n) => n.type === "heading")).toBe(true);
    expect(out.length).toBe(1);
  });

  it("creates a new section when isNew", () => {
    const out = appendAnswerToSections(sections, { targetSectionId: null, sectionTitle: "LGD", isNew: true }, "Q", "A");
    expect(out.length).toBe(2);
    expect(out[1].title).toBe("LGD");
    expect(out[1].origin).toBe("followup");
  });

  it("falls through to a new section when targetSectionId is missing (never drops the answer)", () => {
    const out = appendAnswerToSections(sections, { targetSectionId: "does-not-exist", sectionTitle: "Orphan", isNew: false }, "Q", "A");
    expect(out.length).toBe(2);
    expect(out.find((s) => s.id === "s1")!.bodyJson.content.length).toBe(0); // original untouched
    expect(out[1].origin).toBe("followup");
  });
});
