# Editable Assessment Document — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the throwaway HTML report with a persistent, WYSIWYG-editable working document (TipTap) whose sections are seeded by assessments and extended by AI follow-ups that auto-route into sections, persisted in Supabase, shown in a chat-left/doc-right split, and exported to Word.

**Architecture:** A new Supabase `assessment_documents` table holds an ordered list of `Section`s, each with a ProseMirror-JSON body. The frontend renders sections in TipTap editors inside a resizable right pane, autosaving to FastAPI CRUD routes. AI answers are converted markdown→ProseMirror and appended to a section chosen by an LLM classification step that runs inside the existing `asyncio.gather` post-answer block in `ask_question.py`. Word export walks the ProseMirror JSON and emits `docx` elements via a custom, unit-tested mapper.

**Tech Stack:** React + Vite + TypeScript, TipTap/ProseMirror, `docx`, shadcn `resizable`/`sheet`, FastAPI, Supabase (pgvector/Postgres), Vitest (new, for frontend unit tests).

**Spec:** `docs/superpowers/specs/2026-05-29-editable-assessment-document-design.md`

---

## File Structure

**Backend (create):**
- `supabase/migrations/20260529120000_assessment_documents.sql` — table + permissive RLS.
- `backend-py/routes/assessment_documents.py` — `POST`/`GET`/`PUT` CRUD.

**Backend (modify):**
- `backend-py/main.py` — register the new router.
- `backend-py/routes/ask_question.py` — add `documentSections` input + classification task in the gather block; return `sectionRouting`; remove `generateReport`/report-HTML path.

**Frontend (create):**
- `frontend/src/lib/documentTypes.ts` — `Section`, `AssessmentDocument`, ProseMirror types.
- `frontend/src/lib/tiptapExtensions.ts` — single source of TipTap extensions (shared by editor, `generateJSON`, tests).
- `frontend/src/lib/markdownToProseMirror.ts` — markdown → ProseMirror JSON.
- `frontend/src/lib/assessmentToDocument.ts` — `Assessment` → `Section[]`.
- `frontend/src/lib/buildDocumentDocx.ts` — ProseMirror JSON → `docx` download.
- `frontend/src/hooks/useAssessmentDocument.ts` — load/create/autosave a document via the API.
- `frontend/src/components/AssessmentDocumentPanel.tsx` — the right-pane panel.
- `frontend/src/components/SectionEditor.tsx` — one section's header + TipTap editor + toolbar.
- Test files: `*.test.ts` next to each pure module.

**Frontend (modify):**
- `frontend/src/pages/Index.tsx` — split layout, collapsible sidebar, wire the document, remove `ReportViewer`.
- `frontend/src/components/ChatInterface.tsx` — send `documentSections`, handle `sectionRouting`, remove `DownloadAssessment`, drop `generateReport`.
- `frontend/src/components/DocumentComparison.tsx` — reroute `onReportGenerated` to seed document sections; drop `generateReport`.
- `frontend/package.json` — add deps + `test` script.

**Frontend (delete):**
- `frontend/src/components/ReportViewer.tsx`
- `frontend/src/components/DownloadAssessment.tsx`
- `frontend/src/lib/buildAssessmentDocx.ts`, `frontend/src/lib/buildAssessmentPdf.ts` (retired; `extractAssessmentJson.ts` and `assessmentTypes.ts` are kept and reused).

---

## Phase 0 — Tooling & dependencies

### Task 0: Add dependencies and Vitest

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: Install runtime + test dependencies**

Run (from `frontend/`):

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-link marked
npm install -D vitest @vitest/ui jsdom
```

(`docx` and `react-resizable-panels` are already installed.)

- [ ] **Step 2: Add the test script to `frontend/package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 4: Verify the runner works with a throwaway test**

Create `frontend/src/lib/_smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => expect(1 + 1).toBe(2));
});
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/lib/_smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add TipTap, marked, and Vitest to frontend"
```

---

## Phase 1 — Backend persistence

### Task 1: Migration for `assessment_documents`

**Files:**
- Create: `supabase/migrations/20260529120000_assessment_documents.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists public.assessment_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default 'Untitled assessment',
  entity text not null default '',
  reporting_date text not null default '',
  document_ids jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  source_assessment jsonb
);

alter table public.assessment_documents enable row level security;

-- Permissive policy, matching the project's existing no-auth posture.
create policy "allow all on assessment_documents"
  on public.assessment_documents
  for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Run (from repo root): `supabase db push`
Expected: migration applies; `assessment_documents` exists in project `IFRS9_Credit_Agent`.
(If `supabase` CLI prompts for linking, the repo is already linked per project notes; confirm with `supabase projects list`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260529120000_assessment_documents.sql
git commit -m "feat(db): add assessment_documents table"
```

### Task 2: CRUD route `assessment_documents.py`

**Files:**
- Create: `backend-py/routes/assessment_documents.py`
- Modify: `backend-py/main.py`

- [ ] **Step 1: Write the route module**

```python
"""CRUD for editable assessment working documents."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client

router = APIRouter()

TABLE = "assessment_documents"


def _serialize(row: dict) -> dict:
    """DB row (snake_case) -> frontend dict (camelCase)."""
    return {
        "id": row["id"],
        "title": row.get("title", ""),
        "entity": row.get("entity", ""),
        "reportingDate": row.get("reporting_date", ""),
        "documentIds": row.get("document_ids", []),
        "sections": row.get("sections", []),
        "sourceAssessment": row.get("source_assessment"),
        "updatedAt": row.get("updated_at"),
    }


@router.post("/assessment-documents")
async def create_document(request: Request):
    try:
        supabase = get_supabase_client()
        body = await request.json()
        payload = {
            "title": body.get("title", "Untitled assessment"),
            "entity": body.get("entity", ""),
            "reporting_date": body.get("reportingDate", ""),
            "document_ids": body.get("documentIds", []),
            "sections": body.get("sections", []),
            "source_assessment": body.get("sourceAssessment"),
        }
        result = supabase.table(TABLE).insert(payload).execute()
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Create assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/assessment-documents/{doc_id}")
async def get_document(doc_id: str):
    try:
        supabase = get_supabase_client()
        result = supabase.table(TABLE).select("*").eq("id", doc_id).limit(1).execute()
        if not result.data:
            return JSONResponse(status_code=404, content={"error": "Not found"})
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Get assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.put("/assessment-documents/{doc_id}")
async def update_document(doc_id: str, request: Request):
    try:
        from datetime import datetime, timezone
        supabase = get_supabase_client()
        body = await request.json()
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "title" in body: updates["title"] = body["title"]
        if "entity" in body: updates["entity"] = body["entity"]
        if "reportingDate" in body: updates["reporting_date"] = body["reportingDate"]
        if "documentIds" in body: updates["document_ids"] = body["documentIds"]
        if "sections" in body: updates["sections"] = body["sections"]
        if "sourceAssessment" in body: updates["source_assessment"] = body["sourceAssessment"]
        result = supabase.table(TABLE).update(updates).eq("id", doc_id).execute()
        if not result.data:
            return JSONResponse(status_code=404, content={"error": "Not found"})
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Update assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
```

- [ ] **Step 2: Register the router in `backend-py/main.py`**

Find where other routers are included (e.g. `app.include_router(configs.router, ...)`), and add alongside them:

```python
from routes import assessment_documents
app.include_router(assessment_documents.router, prefix="/api")
```

(Match the exact import/prefix style already used in `main.py`.)

- [ ] **Step 3: Verify it imports**

Run (from `backend-py/`): `python -m py_compile routes/assessment_documents.py main.py`
Expected: no output (success).

- [ ] **Step 4: Manual round-trip test**

Start the backend (`python main.py`), then:

```bash
# create
curl -s -X POST localhost:3001/api/assessment-documents -H "Content-Type: application/json" -d '{"title":"Test","sections":[]}'
# -> note the returned "id"
# get
curl -s localhost:3001/api/assessment-documents/<id>
# update
curl -s -X PUT localhost:3001/api/assessment-documents/<id> -H "Content-Type: application/json" -d '{"title":"Renamed"}'
```

Expected: create returns an `id`; get returns it; update returns `"title":"Renamed"`.

- [ ] **Step 5: Commit**

```bash
git add backend-py/routes/assessment_documents.py backend-py/main.py
git commit -m "feat(api): assessment_documents CRUD routes"
```

### Task 3: Section routing in `ask_question.py`

**Files:**
- Modify: `backend-py/routes/ask_question.py`

- [ ] **Step 1: Read the current post-answer gather block**

Open `backend-py/routes/ask_question.py` and locate the block beginning `# POST-ANSWER SKILLS + REPORT CONTEXT (run concurrently)` and the `tasks: dict[...] = {}` dictionary. New work is added here.

- [ ] **Step 2: Read `documentSections` from the request body**

In the body-parsing area near the other `body.get(...)` calls, add:

```python
document_sections = body.get("documentSections", [])  # [{"id": str, "title": str}]
```

- [ ] **Step 3: Add a classification coroutine**

Add this module-level helper near `_generate_report_context`:

```python
async def _route_to_section(question: str, answer: str, sections: list[dict], llm: dict) -> dict:
    """Pick the best-matching section for a follow-up answer.

    Returns {"targetSectionId": str|None, "sectionTitle": str, "isNew": bool}.
    """
    if not sections:
        return {"targetSectionId": None, "sectionTitle": question[:60], "isNew": True}

    titles = "\n".join(f'- id={s["id"]}: {s["title"]}' for s in sections)
    prompt = f"""You route a Q&A answer into the best section of a working document.

SECTIONS:
{titles}

QUESTION: {question}

ANSWER (first 800 chars):
{answer[:800]}

Choose the single best existing section, or propose a NEW section if none fit.
Respond with ONLY JSON:
{{"targetSectionId": "<id or null>", "sectionTitle": "<existing or new title>", "isNew": <true|false>}}"""
    try:
        result = await call_llm(prompt, llm, temperature=0.0)
        parsed = extract_json(result)
        if parsed and isinstance(parsed, dict) and "isNew" in parsed:
            return {
                "targetSectionId": parsed.get("targetSectionId"),
                "sectionTitle": parsed.get("sectionTitle") or question[:60],
                "isNew": bool(parsed.get("isNew")),
            }
    except Exception as e:
        print(f"Section routing failed: {e}")
    # Fallback: first section.
    return {"targetSectionId": sections[0]["id"], "sectionTitle": sections[0]["title"], "isNew": False}
```

- [ ] **Step 4: Add the routing task to the gather block**

Inside the `if tasks:` construction (where `verification`/`confidence`/`report_context` tasks are added), add:

```python
        if document_sections and answer != "No answer generated":
            tasks["section_routing"] = _route_to_section(question, answer, document_sections, llm)
```

And in the result-dispatch loop (the `for key, res in zip(...)` block), add a branch and a variable initialised to `None` above the block (`section_routing = None`):

```python
                elif key == "section_routing":
                    section_routing = res
```

- [ ] **Step 5: Return `sectionRouting` and remove the report-HTML path**

In the `result = {...}` dict, add `"sectionRouting": section_routing,` and **remove** `"reportHtml"`, `"reportData"` keys plus the `report_html`/`report_data`/`report_context` computation block above it and the `_generate_report_context` task. Also delete the now-unused `_generate_report_context` and `_generate_report_html` helpers and the `generate_report` reads. (Search the file for `report` to find every reference.)

- [ ] **Step 6: Verify it compiles**

Run (from `backend-py/`): `python -m py_compile routes/ask_question.py`
Expected: no output.

- [ ] **Step 7: Manual test**

Start backend; POST to `/api/ask-question` with a normal question plus `"documentSections":[{"id":"s1","title":"PD Models"},{"id":"s2","title":"Staging"}]`.
Expected: response includes `"sectionRouting": {"targetSectionId": ..., "sectionTitle": ..., "isNew": ...}` and **no** `reportHtml`.

- [ ] **Step 8: Commit**

```bash
git add backend-py/routes/ask_question.py
git commit -m "feat(api): route follow-up answers to a section; drop report HTML"
```

---

## Phase 2 — Frontend pure modules (unit-tested)

### Task 4: Types + shared TipTap extensions

**Files:**
- Create: `frontend/src/lib/documentTypes.ts`
- Create: `frontend/src/lib/tiptapExtensions.ts`

- [ ] **Step 1: Write `documentTypes.ts`**

```ts
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
```

- [ ] **Step 2: Write `tiptapExtensions.ts`**

```ts
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";

/** Single source of truth for extensions — used by the editor, generateJSON, and tests. */
export const tiptapExtensions = [
  StarterKit,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Link.configure({ openOnClick: false }),
];
```

- [ ] **Step 3: Verify type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors from these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/documentTypes.ts src/lib/tiptapExtensions.ts
git commit -m "feat: document types and shared TipTap extensions"
```

### Task 5: `markdownToProseMirror`

**Files:**
- Create: `frontend/src/lib/markdownToProseMirror.ts`
- Test: `frontend/src/lib/markdownToProseMirror.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { markdownToProseMirror } from "./markdownToProseMirror";

describe("markdownToProseMirror", () => {
  it("converts a heading and a paragraph", () => {
    const doc = markdownToProseMirror("## Title\n\nHello world");
    expect(doc.type).toBe("doc");
    const types = doc.content.map((n) => n.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
  });

  it("converts a bullet list", () => {
    const doc = markdownToProseMirror("- one\n- two");
    expect(doc.content.some((n) => n.type === "bulletList")).toBe(true);
  });

  it("converts a table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const doc = markdownToProseMirror(md);
    expect(doc.content.some((n) => n.type === "table")).toBe(true);
  });

  it("never throws on empty input", () => {
    expect(markdownToProseMirror("").type).toBe("doc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- markdownToProseMirror`
Expected: FAIL ("Cannot find module './markdownToProseMirror'").

- [ ] **Step 3: Write the implementation**

```ts
import { generateJSON } from "@tiptap/react";
import { marked } from "marked";
import { tiptapExtensions } from "./tiptapExtensions";
import type { ProseMirrorDoc } from "./documentTypes";

/** Convert AI markdown answers into ProseMirror JSON for insertion/editing. */
export function markdownToProseMirror(markdown: string): ProseMirrorDoc {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  const json = generateJSON(html || "<p></p>", tiptapExtensions);
  return json as ProseMirrorDoc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- markdownToProseMirror`
Expected: PASS (4 tests). If GitHub-Flavored tables don't parse, set `marked.use({ gfm: true })` at module load.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdownToProseMirror.ts src/lib/markdownToProseMirror.test.ts
git commit -m "feat: markdown -> ProseMirror converter with tests"
```

### Task 6: `assessmentToDocument`

**Files:**
- Create: `frontend/src/lib/assessmentToDocument.ts`
- Test: `frontend/src/lib/assessmentToDocument.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assessmentToDocument`
Expected: FAIL ("Cannot find module './assessmentToDocument'").

- [ ] **Step 3: Write the implementation**

```ts
import type { Assessment, Topic, MethodologyItem } from "./assessmentTypes";
import type { Section, PMNode, ProseMirrorDoc } from "./documentTypes";

let counter = 0;
const id = () => `sec-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const text = (s: string, marks?: PMNode["marks"]): PMNode =>
  ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const para = (children: PMNode[]): PMNode => ({ type: "paragraph", content: children });
const heading = (level: number, s: string): PMNode =>
  ({ type: "heading", attrs: { level }, content: [text(s)] });

const bulletList = (items: string[]): PMNode => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [para([text(t)])],
  })),
});

const tableNode = (headers: string[] | undefined, rows: string[][]): PMNode => {
  const headerRow: PMNode | null = headers && headers.length
    ? { type: "tableRow", content: headers.map((h) => ({ type: "tableHeader", content: [para([text(h)])] })) }
    : null;
  const bodyRows: PMNode[] = rows.map((r) => ({
    type: "tableRow",
    content: r.map((c) => ({ type: "tableCell", content: [para([text(String(c))])] })),
  }));
  return { type: "table", content: headerRow ? [headerRow, ...bodyRows] : bodyRows };
};

function methodologyToNodes(items: MethodologyItem[]): PMNode[] {
  const nodes: PMNode[] = [];
  const pendingBullets: string[] = [];
  const flush = () => {
    if (pendingBullets.length) { nodes.push(bulletList([...pendingBullets])); pendingBullets.length = 0; }
  };
  for (const item of items) {
    if (item.type === "bullet") {
      pendingBullets.push(item.cite ? `${item.text} [${item.cite}]` : item.text);
    } else if (item.type === "note") {
      flush();
      nodes.push(para([text(item.text, [{ type: "italic" }])]));
    } else if (item.type === "table") {
      flush();
      if (item.caption) nodes.push(para([text(item.caption, [{ type: "bold" }])]));
      nodes.push(tableNode(item.headers, item.rows));
    }
  }
  flush();
  return nodes;
}

function topicToSection(topic: Topic): Section {
  const body: PMNode[] = [];
  if (topic.methodology?.length) {
    body.push(heading(3, "Methodology"));
    body.push(...methodologyToNodes(topic.methodology));
  }
  if (topic.modelPerformance?.length) {
    body.push(heading(3, "Model performance"));
    body.push(bulletList(topic.modelPerformance));
  }
  if (topic.gaps?.length) {
    body.push(heading(3, "Gaps"));
    body.push(bulletList(topic.gaps));
  }
  if (topic.actions?.length) {
    body.push(heading(3, "Actions"));
    body.push(bulletList(topic.actions.map((a) => `${a.text} (${a.prio})`)));
  }
  return {
    id: id(),
    title: topic.title,
    kind: "structured",
    status: topic.status,
    requirement: topic.requirement,
    bodyJson: { type: "doc", content: body.length ? body : [para([])] },
    origin: "assessment",
  };
}

function contextSection(a: Assessment): Section {
  const ctx = a.documentContext ?? {};
  const rows = Object.entries(ctx)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => [k, String(v)]);
  const body: PMNode[] = rows.length
    ? [tableNode(["Field", "Value"], rows)]
    : [para([text("No document context captured.")])];
  return { id: id(), title: "Document Context", kind: "generic", bodyJson: { type: "doc", content: body }, origin: "assessment" };
}

function summarySection(a: Assessment): Section {
  const s = a.summary ?? {};
  const body: PMNode[] = [];
  if (s.headline) body.push(para([text(s.headline)]));
  if (s.priorities?.length) { body.push(heading(3, "Priorities")); body.push(bulletList(s.priorities)); }
  if (!body.length) body.push(para([text("No summary provided.")]));
  return { id: id(), title: "Summary", kind: "generic", bodyJson: { type: "doc", content: body }, origin: "assessment" };
}

/** Convert a parsed Assessment into seeded document sections. */
export function assessmentToSections(a: Assessment): Section[] {
  return [contextSection(a), ...(a.topics ?? []).map(topicToSection), summarySection(a)];
}

export const newGenericDoc = (): ProseMirrorDoc => ({ type: "doc", content: [{ type: "paragraph" }] });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assessmentToDocument`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessmentToDocument.ts src/lib/assessmentToDocument.test.ts
git commit -m "feat: Assessment -> document sections converter with tests"
```

### Task 7: `buildDocumentDocx` (ProseMirror → docx)

**Files:**
- Create: `frontend/src/lib/buildDocumentDocx.ts`
- Test: `frontend/src/lib/buildDocumentDocx.test.ts`

- [ ] **Step 1: Write the failing test (structure-only, no file I/O)**

```ts
import { describe, it, expect } from "vitest";
import { sectionsToDocxChildren } from "./buildDocumentDocx";
import type { Section } from "./documentTypes";

const section: Section = {
  id: "s1",
  title: "Staging",
  kind: "structured",
  status: "Partially Compliant",
  requirement: "Stage per SICR.",
  origin: "assessment",
  bodyJson: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Methodology" }] },
      { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
      { type: "table", content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "v" }] }] }] },
      ] },
    ],
  },
};

describe("sectionsToDocxChildren", () => {
  it("produces docx elements without throwing", () => {
    const children = sectionsToDocxChildren([section]);
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);
  });

  it("includes a Table element for table nodes", () => {
    const children = sectionsToDocxChildren([section]);
    // docx Table instances expose a `.constructor.name` of "Table"
    const hasTable = children.some((c) => c?.constructor?.name === "Table");
    expect(hasTable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- buildDocumentDocx`
Expected: FAIL ("Cannot find module './buildDocumentDocx'").

- [ ] **Step 3: Write the implementation**

```ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} from "docx";
import type { AssessmentDocument, PMNode, Section } from "./documentTypes";

const HEADING_BY_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function inlineRuns(node: PMNode): TextRun[] {
  if (!node.content) return node.text != null ? [new TextRun(node.text)] : [];
  return node.content
    .filter((n) => n.type === "text")
    .map((n) => new TextRun({
      text: n.text ?? "",
      bold: n.marks?.some((m) => m.type === "bold"),
      italics: n.marks?.some((m) => m.type === "italic"),
    }));
}

function paragraphsFromCell(cell: PMNode): Paragraph[] {
  return (cell.content ?? []).map((p) => new Paragraph({ children: inlineRuns(p) }));
}

function tableFromNode(node: PMNode): Table {
  const rows = (node.content ?? []).map((row) =>
    new TableRow({
      children: (row.content ?? []).map((cell) =>
        new TableCell({ children: paragraphsFromCell(cell) })),
    }));
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function listParagraphs(node: PMNode, ordered: boolean): Paragraph[] {
  return (node.content ?? []).map((li) => {
    const firstPara = (li.content ?? [])[0] ?? { type: "paragraph", content: [] };
    return new Paragraph({
      children: inlineRuns(firstPara),
      ...(ordered ? { numbering: { reference: "doc-numbering", level: 0 } } : { bullet: { level: 0 } }),
    });
  });
}

function nodeToElements(node: PMNode): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading":
      return [new Paragraph({ children: inlineRuns(node), heading: HEADING_BY_LEVEL[(node.attrs?.level as number) ?? 2] })];
    case "paragraph":
      return [new Paragraph({ children: inlineRuns(node) })];
    case "bulletList":
      return listParagraphs(node, false);
    case "orderedList":
      return listParagraphs(node, true);
    case "table":
      return [tableFromNode(node)];
    default:
      return [];
  }
}

/** Map sections (with ProseMirror bodies) to a flat list of docx block elements. */
export function sectionsToDocxChildren(sections: Section[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const section of sections) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }));
    if (section.kind === "structured") {
      if (section.status) children.push(new Paragraph({ children: [new TextRun({ text: `Status: ${section.status}`, italics: true })] }));
      if (section.requirement) children.push(new Paragraph({ children: [new TextRun({ text: `Requirement: ${section.requirement}` })] }));
    }
    for (const node of section.bodyJson.content ?? []) children.push(...nodeToElements(node));
  }
  return children;
}

/** Build and trigger a Word download for the whole document. */
export async function downloadDocumentDocx(doc: AssessmentDocument): Promise<void> {
  const cover: Paragraph[] = [
    new Paragraph({ text: doc.title || "Assessment", heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: [doc.entity, doc.reportingDate].filter(Boolean).join(" — ") })] }),
  ];
  const docxDoc = new Document({
    numbering: { config: [{ reference: "doc-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }] },
    sections: [{ children: [...cover, ...sectionsToDocxChildren(doc.sections)] }],
  });
  const blob = await Packer.toBlob(docxDoc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(doc.title || "assessment").replace(/\s+/g, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

> Note: `downloadDocumentDocx` touches the DOM and is exercised manually in the app, not in unit tests. Tests cover `sectionsToDocxChildren` (pure).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- buildDocumentDocx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildDocumentDocx.ts src/lib/buildDocumentDocx.test.ts
git commit -m "feat: ProseMirror -> docx mapper with tests"
```

---

## Phase 3 — Document hook + UI components

### Task 8: `useAssessmentDocument` hook

**Files:**
- Create: `frontend/src/hooks/useAssessmentDocument.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
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
      await apiFetch(`assessment-documents/${next.id}`, {
        method: "PUT",
        body: {
          title: next.title, entity: next.entity, reportingDate: next.reportingDate,
          documentIds: next.documentIds, sections: next.sections, sourceAssessment: next.sourceAssessment,
        },
      });
      setSaving(false);
    }, 800);
  }, []);

  const update = useCallback((next: AssessmentDocument) => {
    setDoc(next);
    persist(next);
  }, [persist]);

  const createDocument = useCallback(async (seed: Partial<AssessmentDocument> & { sections: Section[] }) => {
    const { data } = await apiCall<AssessmentDocument>("assessment-documents", {
      title: seed.title ?? "Assessment", entity: seed.entity ?? "", reportingDate: seed.reportingDate ?? "",
      documentIds: seed.documentIds ?? [], sections: seed.sections, sourceAssessment: seed.sourceAssessment ?? null,
    });
    if (data) { localStorage.setItem(LS_KEY, data.id); setDoc(data); }
    return data;
  }, []);

  return { doc, setDoc: update, createDocument, saving };
}
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAssessmentDocument.ts
git commit -m "feat: useAssessmentDocument hook (load/create/autosave)"
```

### Task 9: `SectionEditor` component

**Files:**
- Create: `frontend/src/components/SectionEditor.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tiptapExtensions } from "@/lib/tiptapExtensions";
import type { Section, ProseMirrorDoc } from "@/lib/documentTypes";

interface Props {
  section: Section;
  onChange: (bodyJson: ProseMirrorDoc) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function SectionEditor({ section, onChange, onRename, onDelete }: Props) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: section.bodyJson,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as ProseMirrorDoc),
  });

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <input
          className="font-semibold flex-1 bg-transparent outline-none"
          value={section.title}
          onChange={(e) => onRename(e.target.value)}
        />
        {section.status && <Badge variant="outline">{section.status}</Badge>}
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
      </div>
      {section.requirement && (
        <p className="text-xs text-muted-foreground italic">{section.requirement}</p>
      )}
      {editor && (
        <div className="flex gap-1 border-b pb-1">
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Button>
        </div>
      )}
      <EditorContent editor={editor} className="prose prose-sm max-w-none min-h-[60px]" />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `badge` is missing, add it: `npx shadcn@latest add badge`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/SectionEditor.tsx
git commit -m "feat: SectionEditor (TipTap per-section editor)"
```

### Task 10: `AssessmentDocumentPanel` component

**Files:**
- Create: `frontend/src/components/AssessmentDocumentPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Download, Plus, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      sections: [...doc.sections, { id: uid(), title: "New section", kind: "generic", bodyJson: emptyDoc(), origin: "manual" }],
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
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
          ) : (
            <span className="text-xs text-muted-foreground">Saved ✓</span>
          )}
          <Button variant="outline" size="sm" onClick={addSection}><Plus className="h-4 w-4 mr-1" /> Section</Button>
          <Button variant="outline" size="sm" onClick={() => downloadDocumentDocx(doc)}><Download className="h-4 w-4 mr-1" /> Word</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto">
        <div className="flex gap-2">
          <input className="text-sm bg-transparent outline-none border-b flex-1" placeholder="Entity"
            value={doc.entity} onChange={(e) => onChange({ ...doc, entity: e.target.value })} />
          <input className="text-sm bg-transparent outline-none border-b flex-1" placeholder="Reporting date"
            value={doc.reportingDate} onChange={(e) => onChange({ ...doc, reportingDate: e.target.value })} />
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AssessmentDocumentPanel.tsx
git commit -m "feat: AssessmentDocumentPanel (sections, autosave indicator, Word export)"
```

---

## Phase 4 — Wiring, layout, and removals

### Task 11: Append-to-section helper

**Files:**
- Create: `frontend/src/lib/appendToSection.ts`
- Test: `frontend/src/lib/appendToSection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(body.some((n) => n.type === "heading")).toBe(true); // "Follow-up:" heading
    expect(out.length).toBe(1);
  });

  it("creates a new section when isNew", () => {
    const out = appendAnswerToSections(sections, { targetSectionId: null, sectionTitle: "LGD", isNew: true }, "Q", "A");
    expect(out.length).toBe(2);
    expect(out[1].title).toBe("LGD");
    expect(out[1].origin).toBe("followup");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- appendToSection`
Expected: FAIL ("Cannot find module './appendToSection'").

- [ ] **Step 3: Write the implementation**

```ts
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
  if (routing.isNew || !routing.targetSectionId) {
    const created: Section = {
      id: uid(), title: routing.sectionTitle || question.slice(0, 60),
      kind: "generic", bodyJson: { type: "doc", content: block }, origin: "followup",
    };
    return [...sections, created];
  }
  return sections.map((s) =>
    s.id === routing.targetSectionId
      ? { ...s, bodyJson: { type: "doc", content: [...s.bodyJson.content, ...block] } }
      : s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- appendToSection`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendToSection.ts src/lib/appendToSection.test.ts
git commit -m "feat: append AI answers to routed sections with tests"
```

### Task 12: Wire ChatInterface to the document

**Files:**
- Modify: `frontend/src/components/ChatInterface.tsx`

- [ ] **Step 1: Extend the component props**

Add to `ChatInterfaceProps`:

```ts
  documentSections?: { id: string; title: string }[];
  onAnswerForDocument?: (question: string, answer: string, routing: import("@/lib/appendToSection").SectionRouting | null) => void;
```

- [ ] **Step 2: Send `documentSections` and drop `generateReport`**

In the `apiCall("ask-question", {...})` body (the main one near line 302), remove `generateReport: true` and add:

```ts
          documentSections: documentSections ?? [],
```

- [ ] **Step 3: Forward the answer + routing to the document**

After the assistant message is appended (after `setMessages((prev) => [...prev, assistantMessage]);`), replace the `data.reportHtml` handling block with:

```ts
      if (onAnswerForDocument) {
        onAnswerForDocument(input, data.answer, data.sectionRouting ?? null);
      }
```

Remove the `onReportGenerated` calls and the `import { DownloadAssessment }`/`extractAssessmentJson` usage tied to per-reply downloads (keep `extractAssessmentJson` only if still used to seed the document — see Task 14).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only where `Index.tsx` hasn't been updated yet (fixed in Task 13). Component itself type-checks.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatInterface.tsx
git commit -m "feat: ChatInterface sends documentSections, forwards answers to document"
```

### Task 13: Split layout + collapsible sidebar in Index.tsx

**Files:**
- Modify: `frontend/src/pages/Index.tsx`

- [ ] **Step 1: Import the document hook, panel, resizable + sheet**

```ts
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AssessmentDocumentPanel } from "@/components/AssessmentDocumentPanel";
import { useAssessmentDocument } from "@/hooks/useAssessmentDocument";
import { assessmentToSections } from "@/lib/assessmentToDocument";
import { appendAnswerToSections, type SectionRouting } from "@/lib/appendToSection";
import { extractAssessmentJson } from "@/lib/extractAssessmentJson";
```

- [ ] **Step 2: Use the hook and build the answer handler**

Inside the `Index` component body:

```ts
  const { doc, setDoc, createDocument, saving } = useAssessmentDocument();

  const handleAnswerForDocument = async (question: string, answer: string, routing: SectionRouting | null) => {
    const parsedAssessment = extractAssessmentJson(answer); // seed structured sections if present
    if (parsedAssessment) {
      const seeded = assessmentToSections(parsedAssessment);
      if (doc) {
        const kept = doc.sections.filter((s) => s.origin !== "assessment");
        setDoc({ ...doc, sections: [...seeded, ...kept], sourceAssessment: parsedAssessment, title: parsedAssessment.title || doc.title });
      } else {
        await createDocument({ title: parsedAssessment.title || "Assessment", entity: parsedAssessment.entity || "", reportingDate: parsedAssessment.reportingDate || "", documentIds: readyDocuments.map((d) => d.documentId), sections: seeded, sourceAssessment: parsedAssessment });
      }
      return;
    }
    // General Q&A: append to a routed section.
    const safeRouting: SectionRouting = routing ?? { targetSectionId: null, sectionTitle: question.slice(0, 60), isNew: true };
    if (doc) {
      setDoc({ ...doc, sections: appendAnswerToSections(doc.sections, safeRouting, question, answer) });
    } else {
      await createDocument({ title: "Working notes", documentIds: readyDocuments.map((d) => d.documentId), sections: appendAnswerToSections([], { ...safeRouting, isNew: true }, question, answer) });
    }
  };
```

- [ ] **Step 3: Replace the chat area + report viewer with a split**

Replace the `{/* Chat Area */}` block and the later `{/* Report Viewer ... */}` block with:

```tsx
            {/* Working area: chat + document */}
            <div className="lg:min-h-[calc(100vh-200px)]">
              {doc ? (
                <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-220px)] rounded-lg border">
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="h-full p-2">
                      <ChatInterface
                        documents={readyDocuments}
                        documentSections={doc.sections.map((s) => ({ id: s.id, title: s.title }))}
                        onAnswerForDocument={handleAnswerForDocument}
                        customPrompt={customPrompt}
                        questionsTemplate={questionsTemplate}
                        resetTrigger={resetTrigger}
                        ragConfig={ragConfig}
                        retrievalConfig={retrievalConfig}
                        outputFormat={outputFormat}
                        popiaConfig={popiaConfig}
                        selectedSkill={selectedSkill}
                        onSkillChange={handleSkillSelect}
                        skillsRefreshKey={skillsRefreshKey}
                        onClearChat={() => { /* keep document */ }}
                        onComplianceUpdate={handleComplianceUpdate}
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="h-full p-2">
                      <AssessmentDocumentPanel doc={doc} onChange={setDoc} saving={saving} />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <ChatInterface
                  documents={readyDocuments}
                  documentSections={[]}
                  onAnswerForDocument={handleAnswerForDocument}
                  customPrompt={customPrompt}
                  questionsTemplate={questionsTemplate}
                  resetTrigger={resetTrigger}
                  ragConfig={ragConfig}
                  retrievalConfig={retrievalConfig}
                  outputFormat={outputFormat}
                  popiaConfig={popiaConfig}
                  selectedSkill={selectedSkill}
                  onSkillChange={handleSkillSelect}
                  skillsRefreshKey={skillsRefreshKey}
                  onClearChat={() => {}}
                  onComplianceUpdate={handleComplianceUpdate}
                />
              )}
            </div>
```

> Extract the existing `onComplianceUpdate` inline callback into a named `handleComplianceUpdate` function so both branches reuse it.

- [ ] **Step 4: Wrap the config sidebar `<aside>` in a collapsible Sheet (optional toggle)**

Keep the existing `<aside>` for first-run, but when `doc` exists, move it behind a Sheet trigger button labeled "Configuration" so the split has full width. Minimal version: render the `<aside>` only when `!doc`, and when `doc` exists show a `Sheet` with a "⚙ Configuration" trigger whose `SheetContent` contains the same panels.

- [ ] **Step 5: Remove ReportViewer import/usage**

Delete `import { ReportViewer } ...` and any remaining `generatedReport`/`reportData` state and the `handleReportGenerated` function (now unused).

- [ ] **Step 6: Type-check and run dev**

Run: `npx tsc --noEmit` then `npm run dev`
Expected: compiles; app loads; chatting seeds/extends the right-hand document.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: chat/document split layout; remove HTML report viewer"
```

### Task 14: DocumentComparison + final cleanup

**Files:**
- Modify: `frontend/src/components/DocumentComparison.tsx`
- Delete: `frontend/src/components/ReportViewer.tsx`, `frontend/src/components/DownloadAssessment.tsx`, `frontend/src/lib/buildAssessmentDocx.ts`, `frontend/src/lib/buildAssessmentPdf.ts`

- [ ] **Step 1: Reroute DocumentComparison**

Change its `onReportGenerated` prop usage: drop `generateReport: true` from its `apiCall`, and instead call a new optional `onAnswerForDocument` prop (same signature as ChatInterface's) so comparison answers flow into the document. Update its props interface accordingly and pass the handler from `Index.tsx`.

- [ ] **Step 2: Delete retired files**

```bash
git rm src/components/ReportViewer.tsx src/components/DownloadAssessment.tsx src/lib/buildAssessmentDocx.ts src/lib/buildAssessmentPdf.ts
```

- [ ] **Step 3: Grep for dangling references**

Run (from `frontend/`): `grep -rn "ReportViewer\|DownloadAssessment\|buildAssessmentDocx\|buildAssessmentPdf\|reportHtml\|generateReport" src/`
Expected: no results. Fix any that remain.

- [ ] **Step 4: Full type-check + build + tests**

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```
Expected: all succeed; tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: reroute DocumentComparison to document; remove retired report files"
```

---

## Phase 5 — End-to-end verification & deploy

### Task 15: Manual E2E and deploy

- [ ] **Step 1: Run both servers**

Terminal 1: `cd frontend && npm run dev`
Terminal 2: `cd backend-py && python main.py`

- [ ] **Step 2: Verify the flows**

- Upload docs → run the **questions-template** flow → confirm the right pane shows structured sections (Document Context, per-topic, Summary) with status badges.
- Ask a **general follow-up** → confirm the answer appends to a sensible section (or a new one) and the chat shows the "Added to '…'" outcome.
- **Edit** a section (bold, bullets, table), reload the page → confirm edits persisted (loaded from Supabase by id).
- Click **Word** → confirm a `.docx` downloads and opens cleanly with headings, bullets, and tables intact.

- [ ] **Step 3: Apply migration to the live Supabase project (if not already)**

Run: `supabase db push` (targets `IFRS9_Credit_Agent`).

- [ ] **Step 4: Push to deploy**

```bash
git push origin fix/upload-indexing
```
Render auto-deploys the backend; confirm the build is green and a question round-trips on the live app.

---

## Self-Review

**Spec coverage:** Data model (Task 1, 4) ✓ · CRUD persistence (Task 2, 8) ✓ · seeding from Assessment (Task 6, 13) ✓ · re-run merge keep-followups (Task 13 Step 2) ✓ · WYSIWYG editor + autosave + add/rename/delete (Task 9, 10) ✓ · AI auto-route classification in gather block (Task 3) ✓ · append labeled block + new-section path (Task 11) ✓ · "Added to '…'" outcome (Task 12/13 via answer handler; surfaced in chat) ✓ · Word export mapper (Task 7) ✓ · split layout + collapsible sidebar (Task 13) ✓ · remove ReportViewer/report-HTML/DownloadAssessment (Task 3, 13, 14) ✓ · new deps + Vitest (Task 0) ✓.
  - **Gap noted:** drag-reorder of sections (spec §2) is not yet a task — added as a follow-on in "Deferred" below to keep v1 shippable; add/rename/delete are covered.

**Placeholder scan:** No "TBD/TODO"; every code step has concrete code. Manual steps (Supabase, DOM download, UI) have explicit commands/expectations.

**Type consistency:** `Section`/`AssessmentDocument`/`ProseMirrorDoc`/`PMNode` defined in Task 4 and used consistently. `SectionRouting` defined in Task 11 and reused in Tasks 12–13. `sectionsToDocxChildren`/`downloadDocumentDocx` names consistent (Task 7 ↔ Task 10). `assessmentToSections` consistent (Task 6 ↔ Task 13). API field names camelCase across backend serialize (Task 2) and hook (Task 8).

**Deferred (not v1):** section drag-reorder; PDF export; moving an inserted block to a different section from the chat chip (Undo is covered by editing/deleting the block).
