import type { Assessment, ComplianceStatus } from "./assessmentTypes";

/** Minimal ProseMirror node typing — enough for our converters/mapper. */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}
export interface ProseMirrorDoc {
  type: "doc";
  content: PMNode[];
}

export type SectionKind = "structured" | "generic";
export type SectionOrigin = "assessment" | "followup" | "manual";

export interface Section {
  id: string;
  title: string;
  kind: SectionKind;
  status?: ComplianceStatus;
  requirement?: string;
  bodyJson: ProseMirrorDoc;
  origin: SectionOrigin;
}

export interface AssessmentDocument {
  id: string;
  title: string;
  entity: string;
  reportingDate: string;
  documentIds: string[];
  sections: Section[];
  sourceAssessment: Assessment | null;
  updatedAt?: string;
}

export const emptyDoc = (): ProseMirrorDoc => ({ type: "doc", content: [] });
