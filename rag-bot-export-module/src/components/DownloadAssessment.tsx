/**
 * DownloadAssessment — two buttons that download the IFRS 9 assessment
 * as either a Word document or a PDF.
 *
 * Usage:
 *   <DownloadAssessment assessment={extractedAssessment} />
 *
 * Where `assessment` is the structured Assessment JSON parsed from the
 * bot's response (see `lib/extractAssessmentJson.ts`).
 *
 * If no `assessment` is provided, the buttons are hidden — this is the
 * expected behaviour when the bot's response did not include the JSON
 * fence (e.g. for a non-assessment query).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Assessment } from "@/lib/assessmentTypes";
import { downloadAssessmentDocx } from "@/lib/buildAssessmentDocx";
import { downloadAssessmentPdf } from "@/lib/buildAssessmentPdf";

interface Props {
  assessment: Assessment | null;
  className?: string;
}

export function DownloadAssessment({ assessment, className }: Props) {
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

  if (!assessment) return null;

  const onDocx = async () => {
    setBusy("docx");
    try {
      await downloadAssessmentDocx(assessment);
      toast.success("Word document downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate Word document");
    } finally {
      setBusy(null);
    }
  };

  const onPdf = async () => {
    setBusy("pdf");
    try {
      await downloadAssessmentPdf(assessment);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate PDF");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`flex gap-2 ${className || ""}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={onDocx}
        disabled={busy !== null}
      >
        {busy === "docx" ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <FileText className="h-4 w-4 mr-2" />
        )}
        Download as Word
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onPdf}
        disabled={busy !== null}
      >
        {busy === "pdf" ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <FileDown className="h-4 w-4 mr-2" />
        )}
        Download as PDF
      </Button>
    </div>
  );
}
