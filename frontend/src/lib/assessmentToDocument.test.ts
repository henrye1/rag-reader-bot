import { describe, it, expect } from "vitest";
import { assessmentToSections } from "./assessmentToDocument";
import type { Assessment } from "./assessmentTypes";

const sample: Assessment = {
  title: "AgriBank ECL",
  entity: "AgriBank",
  reportingDate: "March 2025",
  topics: [
    {
      num: 1,
      title: "Staging",
      status: "Partially Compliant",
      requirement: "Stage assets per SICR.",
      methodology: [
        { type: "bullet", text: "12-month PD horizon", cite: "Memo p.4" },
        { type: "table", caption: "Coverage", headers: ["Stage", "%"], rows: [["1", "0.8%"]] },
      ],
      gaps: ["No backtest"],
      actions: [{ text: "Add backtest", prio: "High" }],
    },
  ],
  summary: { headline: "Mostly compliant", priorities: ["Backtesting"] },
  documentContext: { entity: "AgriBank", currency: "ZAR" },
};

describe("assessmentToSections", () => {
  it("creates a context section, one section per topic, and a summary section", () => {
    const sections = assessmentToSections(sample);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Document Context");
    expect(titles).toContain("Staging");
    expect(titles).toContain("Summary");
  });

  it("marks topic sections structured with status + requirement", () => {
    const staging = assessmentToSections(sample).find((s) => s.title === "Staging")!;
    expect(staging.kind).toBe("structured");
    expect(staging.status).toBe("Partially Compliant");
    expect(staging.requirement).toBe("Stage assets per SICR.");
    expect(staging.origin).toBe("assessment");
  });

  it("renders methodology bullets and tables into the body", () => {
    const staging = assessmentToSections(sample).find((s) => s.title === "Staging")!;
    const bodyTypes = staging.bodyJson.content.map((n) => n.type);
    expect(bodyTypes).toContain("bulletList");
    expect(bodyTypes).toContain("table");
  });
});
