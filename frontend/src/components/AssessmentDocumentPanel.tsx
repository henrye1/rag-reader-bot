import { Download, Plus, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionEditor } from "./SectionEditor";
import { downloadDocumentDocx } from "@/lib/buildDocumentDocx";
import { emptyDoc } from "@/lib/documentTypes";
import type { AssessmentDocument, ProseMirrorDoc, Section } from "@/lib/documentTypes";

interface Props {
  doc: AssessmentDocument;
  onChange: (doc: AssessmentDocument) => void;
  saving: boolean;
}

const uid = () => `sec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export function AssessmentDocumentPanel({ doc, onChange, saving }: Props) {
  const updateSection = (id: string, patch: Partial<Section>) =>
    onChange({ ...doc, sections: doc.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const addSection = () =>
    onChange({
      ...doc,
      sections: [
        ...doc.sections,
        { id: uid(), title: "New section", kind: "generic" as const, bodyJson: emptyDoc(), origin: "manual" as const },
      ],
    });

  const deleteSection = (id: string) =>
    onChange({ ...doc, sections: doc.sections.filter((s) => s.id !== id) });

  return (
    <Card className="shadow-soft h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 shrink-0" />
          <input
            className="font-semibold text-lg bg-transparent outline-none truncate"
            value={doc.title}
            onChange={(e) => onChange({ ...doc, title: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Saved ✓</span>
          )}
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="h-4 w-4 mr-1" /> Section
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadDocumentDocx(doc)}>
            <Download className="h-4 w-4 mr-1" /> Word
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto">
        <div className="flex gap-2">
          <input
            className="text-sm bg-transparent outline-none border-b flex-1"
            placeholder="Entity"
            value={doc.entity}
            onChange={(e) => onChange({ ...doc, entity: e.target.value })}
          />
          <input
            className="text-sm bg-transparent outline-none border-b flex-1"
            placeholder="Reporting date"
            value={doc.reportingDate}
            onChange={(e) => onChange({ ...doc, reportingDate: e.target.value })}
          />
        </div>
        {doc.sections.map((s) => (
          <SectionEditor
            key={s.id}
            section={s}
            onChange={(bodyJson: ProseMirrorDoc) => updateSection(s.id, { bodyJson })}
            onRename={(title) => updateSection(s.id, { title })}
            onDelete={() => deleteSection(s.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
