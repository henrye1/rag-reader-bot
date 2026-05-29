import { markdownToProseMirror } from "./markdownToProseMirror";
import type { Section, PMNode } from "./documentTypes";

export interface SectionRouting {
  targetSectionId: string | null;
  sectionTitle: string;
  isNew: boolean;
}

const uid = () => `sec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

function answerBlock(question: string, answer: string): PMNode[] {
  const head: PMNode = { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: `Follow-up: ${question}` }] };
  const body = markdownToProseMirror(answer).content;
  return [head, ...body];
}

/** Append an AI answer to the routed section (or create a new section). */
export function appendAnswerToSections(
  sections: Section[],
  routing: SectionRouting,
  question: string,
  answer: string,
): Section[] {
  const block = answerBlock(question, answer);
  const createNew = (): Section => ({
    id: uid(), title: routing.sectionTitle || question.slice(0, 60),
    kind: "generic", bodyJson: { type: "doc", content: block }, origin: "followup",
  });

  if (routing.isNew || !routing.targetSectionId) {
    return [...sections, createNew()];
  }

  // Append to the routed section. If the id no longer exists (e.g. sections were
  // re-seeded while routing was in flight), fall through to a new section so the
  // answer is never silently dropped.
  let matched = false;
  const updated = sections.map((s) => {
    if (s.id !== routing.targetSectionId) return s;
    matched = true;
    return { ...s, bodyJson: { type: "doc", content: [...(s.bodyJson.content ?? []), ...block] } };
  });
  return matched ? updated : [...updated, createNew()];
}
