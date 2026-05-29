# Editable Assessment Document — Design

**Date:** 2026-05-29
**Branch:** `fix/upload-indexing`
**Status:** Approved (design); pending implementation plan

## Summary

Replace the throwaway HTML "Generated Report" with a single, persistent, **editable working document** that is the centrepiece of the app. Every Q&A builds or extends this document: assessment runs (questions-template flow) seed structured topic sections; general questions create or extend sections. Each section body is a **WYSIWYG rich-text editor** (TipTap). AI follow-up questions are **auto-routed** to the best-matching section and appended there. The document is **persisted in Supabase**, shown in a **chat-left / document-right split**, and **exported to Word** via a custom ProseMirror-JSON → `docx` mapper.

This deletes the old HTML report path entirely (component, backend HTML generation, and the per-reply download buttons), which also removes one always-on LLM call per question.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Document source of truth | **Hybrid** — structured sections + free rich-text bodies |
| Edit mechanism | **WYSIWYG** rich editor (TipTap / ProseMirror) |
| AI follow-up placement | **AI auto-routes** to best-matching section; tells the user; editable after |
| Persistence | **Supabase** (server-side; global, no auth) |
| Layout | **Split**: chat left, document right; config sidebar collapses to a toggle |
| Scope | **Always build a document**; remove the old HTML report |
| Editor + export representation | **TipTap + custom ProseMirror-JSON → `docx` mapper** |
| Insertion trigger | **Auto-insert every answer + Undo/Move chip** |
| Export formats (v1) | **Word only**; PDF deferred |
| Re-run merge behaviour | New assessment **replaces structured sections, keeps follow-up/manual sections** |

## Architecture

### 1. Data model & persistence

**New Supabase table `assessment_documents`** (RLS enabled + permissive, matching existing tables):

| column | type | purpose |
|---|---|---|
| `id` | uuid PK (default gen_random_uuid) | document id |
| `created_at` / `updated_at` | timestamptz | timestamps |
| `title`, `entity`, `reporting_date` | text | top-level meta (editable) |
| `document_ids` | jsonb | source document IDs this working paper draws on |
| `sections` | jsonb | ordered array of `Section` |
| `source_assessment` | jsonb (nullable) | original parsed `Assessment` (metrics/summary reference) |

**`Section` shape** (new `frontend/src/lib/documentTypes.ts`):

```ts
interface Section {
  id: string;                    // uuid
  title: string;
  kind: 'structured' | 'generic';
  status?: ComplianceStatus;     // structured topics only (status badge)
  requirement?: string;          // structured topics only
  bodyJson: ProseMirrorDoc;      // TipTap content — the editable body
  origin: 'assessment' | 'followup' | 'manual';
}

interface AssessmentDocument {
  id: string;
  title: string;
  entity: string;
  reportingDate: string;
  documentIds: string[];
  sections: Section[];
  sourceAssessment: Assessment | null;
  updatedAt: string;
}
```

**Seeding from an assessment run:** when the questions-template flow produces an `assessment-json` block (parsed into the existing `Assessment` type), convert:
- each `Topic` → one `structured` Section (`status`, `requirement` set; `bodyJson` built from `methodology` / `modelPerformance` / `gaps` / `actions`),
- the `documentContext` → a `Document Context` section,
- the `summary` → a `Summary` section.

General Q&A with no document yet → create a document with a single `generic` "Notes" section.

**Keying (no auth):** one working document per browser. Its `id` is stored in `localStorage` (e.g. `currentAssessmentDocId`). On load, the app fetches that document from Supabase by id. A "New document" action starts a fresh one (and rewrites the localStorage id).

**Re-run merge:** a new assessment run replaces the document's `structured` sections (origin `assessment`) with the freshly parsed topics, but preserves sections with origin `followup` or `manual`.

### 2. Editor & document panel (frontend)

**`AssessmentDocumentPanel`** (new component, right pane):
- Editable header: title / entity / reporting date.
- Sections rendered in order. Each section: header (title + status badge for `structured`) and a **TipTap editor** bound to `bodyJson`.
- **TipTap extensions:** StarterKit (headings, bold/italic, bullet + ordered lists, paragraphs), Table, Link. Compact toolbar for the focused section.
- **Section controls (v1):** add section, rename, delete, drag-reorder.
- **Autosave:** debounced `PUT` to Supabase on change; "Saving… / Saved ✓" indicator.
- **Export to Word** button at panel top (see §4).

### 3. AI follow-up auto-routing

When the user asks a question and a document exists:
1. Answer generated as today; chat displays it.
2. **Classification task** runs as one more concurrent task in the existing `asyncio.gather` post-answer block in `ask_question.py`, gated by a new optional `documentSections` input (list of `{id, title}`). Given the question + answer + section titles, the LLM returns `{ targetSectionId | null, sectionTitle, isNew, reason }`. `ask-question` returns this as `sectionRouting`. Near-zero added latency (runs alongside other post-answer work).
3. Frontend converts the answer (markdown) → TipTap JSON (markdown → HTML → ProseMirror) and **appends** it to the target section as a labeled block: a small `Follow-up: <question>` heading + answer + citations. If `isNew`, create a `generic` section with `sectionTitle` first.
4. Chat shows a confirmation chip: **"Added to '<section>' — Undo / Move to…"**.

Insertion is automatic for every answer; Undo/Move and full WYSIWYG editing give the user control after the fact.

### 4. Word export (`frontend/src/lib/buildDocumentDocx.ts`)

New module (the structured-only `buildAssessmentDocx.ts` path is retired). Walks `sections` in order; for each:
- emits a Heading (section title) + a status line for `structured` sections,
- recursively maps the section's TipTap JSON nodes → `docx` elements:
  - `heading` → `HeadingLevel`, `paragraph` → `Paragraph`, marks `bold`/`italic` → `TextRun` props, `bulletList`/`orderedList` → numbered/bulleted paragraphs, `table` → `docx` `Table`.
- Document meta (title/entity/date) → cover heading block.
- Reuses fonts/colours/spacing conventions from the existing `buildAssessmentDocx.ts` so output stays audit-grade.

Unit-testable in isolation: TipTap-JSON in → deterministic `docx` structure out.

### 5. Layout & removal of the old report

- **`Index.tsx`:** when a document exists, the main area becomes a **resizable two-pane split** (shadcn `resizable`): `ChatInterface` (left) | `AssessmentDocumentPanel` (right). The config sidebar collapses into a toggle (shadcn `Sheet`/collapsible). Before any document exists, the layout stays as today (sidebar + chat); the right pane appears once the first answer/assessment creates a document.
- **Removed:**
  - `frontend/src/components/ReportViewer.tsx` and its usage in `Index.tsx`.
  - Backend `reportHtml` / `_generate_report_context` generation and the `generateReport` / `reportHtml` / `reportData` plumbing in `ask_question.py` (removes one always-on LLM call per question).
  - The per-reply `DownloadAssessment` buttons in `ChatInterface` (export now lives on the document panel).
- **`DocumentComparison`'s** `onReportGenerated` is rerouted to seed/append document sections instead of producing HTML.

### 6. Backend changes

- **Migration:** `supabase/migrations/<ts>_assessment_documents.sql` — the table from §1, RLS enabled + permissive.
- **New route `backend-py/routes/assessment_documents.py`:**
  - `POST /api/assessment-documents` — create.
  - `GET /api/assessment-documents/{id}` — load.
  - `PUT /api/assessment-documents/{id}` — autosave.
  - Plain dicts, camelCase keys (repo convention).
- **`ask_question.py`:** add optional `documentSections` input; add the section-classification task to the existing `asyncio.gather` block; return `sectionRouting`. Remove the `generateReport` / report-HTML path.
- **`frontend/src/lib/api.ts`:** existing `apiFetch`/`apiCall` cover GET/PUT/POST — no change.

## New dependencies

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table` (+ row/cell/header), `@tiptap/extension-link` — the WYSIWYG editor.
- A markdown→ProseMirror path (e.g. `marked` → TipTap `generateJSON`, or `prosemirror-markdown`) for converting AI answers on insert.
- Already present and reused: `docx` (^9.7.1), `react-resizable-panels` (^2.1.9, backs shadcn `resizable`). `pdfmake` (^0.3.9) stays installed but unused in v1 (PDF deferred). The existing `buildAssessmentPdf.ts` / `buildAssessmentDocx.ts` / `DownloadAssessment.tsx` are retired by this work.

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `documentTypes.ts` | `Section` / `AssessmentDocument` types | `assessmentTypes.ts` |
| `assessmentToDocument.ts` | parse `Assessment` → seeded `Section[]` | `assessmentTypes`, TipTap JSON helpers |
| `markdownToProseMirror.ts` | answer markdown → TipTap JSON (for inserts) | markdown parser, TipTap schema |
| `AssessmentDocumentPanel.tsx` | render + edit sections, autosave, export trigger | TipTap, `api.ts`, `buildDocumentDocx` |
| `buildDocumentDocx.ts` | TipTap JSON → `docx` | `docx` |
| `assessment_documents.py` | CRUD persistence | `supabase_client` |
| `ask_question.py` (delta) | section routing; drop report HTML | `llm`, `rag_skills` |

## Testing

- `buildDocumentDocx.ts`: unit tests — representative TipTap JSON (headings, bold, nested lists, table) → assert `docx` element structure.
- `assessmentToDocument.ts`: unit test — sample `Assessment` → expected `Section[]` (counts, kinds, status).
- `markdownToProseMirror.ts`: unit test — markdown with bullets/table → expected ProseMirror nodes.
- Backend routes: manual/integration — create → load → update round-trip against Supabase.
- Section routing: manual — verify classification picks sane sections and `isNew` path creates a section.

## Out of scope (v1 / YAGNI)

- PDF export (Word only for v1; the mapper can later feed `pdfmake`).
- Per-user documents / auth (documents are global).
- Real-time multi-user collaboration.
- Version history / document diffing.
- Cross-device sync beyond "load by id from Supabase".

## Risks / open considerations

- **Markdown → ProseMirror fidelity** for AI answers (tables especially) — keep the converter narrow and tested.
- **`docx` table mapping** is the fiddliest part of the mapper — cover with tests.
- **Migration on the deployed Supabase project** (`IFRS9_Credit_Agent`) must be applied for the live app; coordinate deploy.
- Removing `generateReport` changes the `ask-question` response shape — ensure no other consumer depends on `reportHtml`/`reportData`.
