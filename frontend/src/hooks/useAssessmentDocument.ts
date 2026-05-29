import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, apiCall } from "@/lib/api";
import type { AssessmentDocument, Section } from "@/lib/documentTypes";

const LS_KEY = "currentAssessmentDocId";

export function useAssessmentDocument() {
  const [doc, setDoc] = useState<AssessmentDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted document on mount.
  useEffect(() => {
    const id = localStorage.getItem(LS_KEY);
    if (!id) return;
    apiFetch<AssessmentDocument>(`assessment-documents/${id}`).then(({ data }) => {
      if (data) setDoc(data);
      else localStorage.removeItem(LS_KEY);
    });
  }, []);

  const persist = useCallback((next: AssessmentDocument) => {
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await apiFetch(`assessment-documents/${next.id}`, {
        method: "PUT",
        body: {
          title: next.title,
          entity: next.entity,
          reportingDate: next.reportingDate,
          documentIds: next.documentIds,
          sections: next.sections,
          sourceAssessment: next.sourceAssessment,
        } as Record<string, unknown>,
      });
      if (error) {
        toast.error("Could not save document changes", { description: error.message });
      }
      setSaving(false);
    }, 800);
  }, []);

  const update = useCallback((next: AssessmentDocument) => {
    setDoc(next);
    persist(next);
  }, [persist]);

  const createDocument = useCallback(async (seed: Partial<AssessmentDocument> & { sections: Section[] }) => {
    const { data } = await apiCall<AssessmentDocument>("assessment-documents", {
      title: seed.title ?? "Assessment",
      entity: seed.entity ?? "",
      reportingDate: seed.reportingDate ?? "",
      documentIds: seed.documentIds ?? [],
      sections: seed.sections,
      sourceAssessment: seed.sourceAssessment ?? null,
    } as Record<string, unknown>);
    if (data) { localStorage.setItem(LS_KEY, data.id); setDoc(data); }
    return data;
  }, []);

  return { doc, setDoc: update, createDocument, saving };
}
