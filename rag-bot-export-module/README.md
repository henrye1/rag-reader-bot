# rag-reader-bot — In-App Word/PDF Export Module

Drop-in client-side module that lets users download IFRS 9 assessment outputs as formatted Word or PDF documents — same navy/blue working-paper styling as the V3-Complete reference. No Edge Function changes for the export itself; the only server-side change is appending a JSON-output rule to the existing prompt (see `PROMPT_CHANGE.md`).

## What it does

1. The bot returns its existing markdown response **plus** a fenced JSON block at the end describing the assessment.
2. The frontend parses the JSON via `extractAssessmentJson` and renders the markdown to the user as before.
3. Two new buttons (Download as Word / Download as PDF) appear under the assistant message. Clicking either button generates the document in the browser and triggers a download — no server round-trip.

## Files in this bundle

| File | Drop in | Purpose |
|---|---|---|
| `src/lib/assessmentTypes.ts` | `src/lib/` | TypeScript interfaces matching the JSON schema |
| `src/lib/extractAssessmentJson.ts` | `src/lib/` | Parse the JSON fence out of the bot's response |
| `src/lib/buildAssessmentDocx.ts` | `src/lib/` | Word document builder (docx-js, browser) |
| `src/lib/buildAssessmentPdf.ts` | `src/lib/` | PDF builder (pdfmake, browser) |
| `src/components/DownloadAssessment.tsx` | `src/components/` | The two-button React component |
| `PROMPT_CHANGE.md` | (server-side change to apply) | Append a JSON-output rule to the prompt |

## Installation

### 1. Install the two npm packages

```bash
npm install docx pdfmake
npm install -D @types/pdfmake
```

(`docx` works in both browser and Node bundles via Vite. `pdfmake` ships with browser-compatible fonts.)

### 2. Copy the files

Drop the `src/` tree from this bundle on top of your existing `src/` directory:

- `src/lib/assessmentTypes.ts`
- `src/lib/extractAssessmentJson.ts`
- `src/lib/buildAssessmentDocx.ts`
- `src/lib/buildAssessmentPdf.ts`
- `src/components/DownloadAssessment.tsx`

If your alias `@/` resolves to `src/`, the imports will work unmodified. (Your repo's `vite.config.ts` and `tsconfig.json` already configure this alias.)

### 3. Apply the prompt change

Apply `PROMPT_CHANGE.md` to `supabase/functions/ask-question/index.ts`. Test once on the AgriBank corpus — the bot's response should now have a `assessment-json` fenced block at the end. The block isn't visible in the UI (it's stripped by `stripAssessmentJson` if you choose to use that helper).

### 4. Wire the component into your message rendering

Find where you render the assistant's message. Likely a file like `src/components/ChatMessage.tsx`, `src/components/AssistantMessage.tsx`, or wherever you call `marked()` / `<ReactMarkdown>` on the response text. Add the parser + button:

```tsx
import { useMemo } from "react";
import { DownloadAssessment } from "@/components/DownloadAssessment";
import { extractAssessmentJson, stripAssessmentJson } from "@/lib/extractAssessmentJson";

function AssistantMessage({ content }: { content: string }) {
  const assessment = useMemo(() => extractAssessmentJson(content), [content]);
  const visibleContent = useMemo(() => stripAssessmentJson(content), [content]);

  return (
    <div className="space-y-3">
      {/* your existing markdown renderer */}
      <ReactMarkdown>{visibleContent}</ReactMarkdown>

      {/* the new download buttons — only show when JSON is present */}
      <DownloadAssessment assessment={assessment} />
    </div>
  );
}
```

The `DownloadAssessment` component returns `null` when no assessment JSON is found, so the buttons only appear on actual assessment responses — they won't clutter ordinary chat replies.

### 5. Verify

Run an assessment query against the AgriBank corpus. The chat should render normally; you should see the two new buttons under the response; clicking each should produce a downloaded file with the navy/blue working-paper styling (matching the V3-Complete reference and the V4 doc already in your workspace).

## How the styling stays consistent

The TypeScript builders are direct ports of `scripts/build_assessment_docx.js` from the `ifrs9-assessment` skill. The colour tokens (navy `#1F3864`, blue `#2E75B6`, RAG status colours, priority badge colours) are identical. The structure — cover page, document control, TOC, document context, topic blocks with status pills, key gaps, recommended actions table, source coverage footer, final summary dashboard — is the same. The Word output uses Calibri; the PDF defaults to Roboto (pdfmake's bundled font) but the layout and colours match.

If you ever want to update the styling, change the `C` colour-tokens object at the top of both `buildAssessmentDocx.ts` and `buildAssessmentPdf.ts`. Keep them in sync.

## Where it sits in your existing architecture

```
                ┌──────────────────────────────┐
                │  React frontend (Vite)       │
                │                              │
                │  ChatMessage → DownloadAssessment
                │              │
                │              ├── buildAssessmentDocx.ts  ──► .docx Blob → browser download
                │              └── buildAssessmentPdf.ts   ──► .pdf  Blob → browser download
                │                              │
                └──────────────┬───────────────┘
                               │ (existing)
                               ▼
                ┌──────────────────────────────┐
                │  Supabase Edge Function      │
                │  ask-question/index.ts       │
                │  + prompt change             │  ← only server-side change
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │  Gemini 2.5 Pro              │
                │  Returns markdown + JSON     │
                └──────────────────────────────┘
```

The export step is entirely client-side. No new Edge Function, no Deno-vs-Node concerns, no LibreOffice container. Just two TypeScript modules and one small prompt addition.

## Caveats

- If the bot returns a response WITHOUT the JSON fence (e.g. a non-assessment chat reply), the buttons won't show — the component returns `null`. This is intentional.
- If the bot's JSON is malformed (parse failure), the buttons also won't show — failure is silent, which is fine. The bot's normal text response still renders.
- pdfmake's bundled fonts don't include all glyphs. If your assessments use unusual Unicode characters, you may need to register an additional font via `pdfMake.fonts`. The Roboto default handles standard Latin, currency symbols (R, N$, €, $, £), and basic mathematics fine.
- The `docx` package compiles to a sizeable bundle (~600 KB minified). If bundle size matters, code-split the export module by using a dynamic import:
  ```ts
  const { downloadAssessmentDocx } = await import("@/lib/buildAssessmentDocx");
  ```
- For very large assessments (50+ pages), Word generation in the browser takes 2–5 seconds. The component shows a spinner during generation so the user sees progress.

## Optional: also expose from a backend endpoint

If you later want to email the documents or store them in Supabase Storage, you can call `buildAssessmentDocx` and `buildAssessmentPdf` from any context with a DOM-like environment. For server-side use in a Supabase Edge Function (Deno runtime), the `docx` package supports Deno via npm: prefix imports — but pdfmake has issues in Deno. For server-side PDF, the cleanest path is to convert the docx to PDF via a headless LibreOffice container. That's a larger change; client-side is the right starting point.

## Smoke test data

If you want a minimal JSON to smoke-test the builders before wiring up the bot, here's a 2-topic example you can paste into `extractAssessmentJson` or pass directly to the builders:

```json
{
  "title": "Smoke Test",
  "entity": "Test Bank",
  "reportingDate": "March 2025",
  "documentContext": {
    "entity": "Test Bank",
    "currency": "USD",
    "totalProvision": "USD 50,000",
    "coverageRatios": { "stage1": "2.0%", "stage2": "5.0%", "stage3": "15.0%", "overall": "5.0%" }
  },
  "topics": [
    {
      "num": 2,
      "title": "ECL Definition",
      "status": "Partially Compliant",
      "requirement": "Three-stage ECL model.",
      "methodology": [{ "type": "bullet", "text": "Three stages implemented." }],
      "gaps": ["Annual cycle insufficient."],
      "actions": [{ "text": "Move to quarterly.", "prio": "High" }]
    }
  ],
  "summary": {
    "counts": { "compliant": 0, "partial": 1, "nonCompliant": 0, "evidenceNotFound": 0 },
    "headline": "Smoke test."
  }
}
```

Either builder will produce a clean working-paper document from this.
