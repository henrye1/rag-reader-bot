/**
 * IFRS 9 Assessment — TypeScript schema for the structured output.
 * Mirrors the JSON schema documented in references/output_format.md of
 * the ifrs9-assessment skill. The bot should return an object of this
 * shape inside a fenced JSON code block at the end of its response.
 */

export type ComplianceStatus =
  | "Compliant"
  | "Partially Compliant"
  | "Non-Compliant"
  | "Evidence Not Found";

export type Priority = "High" | "Medium" | "Low";

export interface MethodologyBullet {
  type: "bullet";
  text: string;
  cite?: string;
}

export interface MethodologyTable {
  type: "table";
  caption?: string;
  headers?: string[];
  rows: string[][];
}

export interface MethodologyNote {
  type: "note";
  text: string;
}

export type MethodologyItem =
  | MethodologyBullet
  | MethodologyTable
  | MethodologyNote;

export interface Action {
  text: string;
  prio: Priority;
}

export interface Topic {
  num: number;
  title: string;
  status: ComplianceStatus;
  requirement: string;
  methodology: MethodologyItem[];
  modelPerformance?: string[];
  gaps?: string[];
  actions?: Action[];
  coverage?: string;
}

export interface CoverageRatios {
  stage1?: string;
  stage2?: string;
  stage3?: string;
  overall?: string;
}

export interface PeerBenchmark {
  present: boolean;
  peers?: (string | number)[][];
}

export interface DocumentContext {
  entity?: string;
  jurisdiction?: string;
  portfolioType?: string;
  currency?: string;
  reportingDate?: string;
  totalGrossExposure?: string;
  totalProvision?: string;
  coverageRatios?: CoverageRatios;
  provisionBySegment?: string[][];
  peerBenchmark?: PeerBenchmark;
  priorReviews?: string[];
  modelMetrics?: [string, string | number][];
  tablesObserved?: string[];
  knownInconsistencies?: string[];
}

export interface Summary {
  counts?: {
    compliant?: number;
    partial?: number;
    nonCompliant?: number;
    evidenceNotFound?: number;
  };
  headline?: string;
  priorities?: string[];
  sequencing?: {
    shortTerm?: string;
    mediumTerm?: string;
    longTerm?: string;
  };
}

export interface Assessment {
  title?: string;
  entity?: string;
  reportingDate?: string;
  preparedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  sourceDocuments?: string[];
  documentContext?: DocumentContext;
  topics: Topic[];
  summary?: Summary;
}
