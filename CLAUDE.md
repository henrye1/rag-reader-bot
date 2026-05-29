# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG-powered Document Q&A system. Users upload documents, which are chunked and embedded into Supabase (pgvector). They then ask questions answered via semantic search + an LLM. Answer generation is **model-selectable per conversation** — Google Gemini 2.5 Pro (default) or Anthropic Claude (Opus 4.7 / Sonnet 4.6 / Haiku 4.5), routed in `backend-py/services/llm.py`. Includes advanced RAG skills (HyDE, query rewriting, decomposition, verification, confidence scoring), expert "skills" (domain-specific prompt templates), POPIA compliance (PII detection/redaction), configurable ingestion/retrieval pipelines, and client-side Word/PDF export of IFRS 9 assessments.

Originally scaffolded with [Lovable](https://lovable.dev).

## Commands

```bash
# Frontend
cd frontend && npm run dev        # Start Vite dev server on port 8080 (proxies /api to :3001)
cd frontend && npm run build      # Production build
cd frontend && npm run build:dev  # Development build
cd frontend && npm run lint       # ESLint (typescript-eslint + react-hooks + react-refresh)
cd frontend && npm run preview    # Preview production build

# Python Backend
cd backend-py && pip install -r requirements.txt   # Install dependencies
cd backend-py && python main.py                     # Start FastAPI server on port 3001
```

No test framework is configured.

### Dev Workflow

Run both servers in separate terminals:
- Terminal 1: `cd frontend && npm run dev` (frontend on :8080, proxies `/api/*` to :3001)
- Terminal 2: `cd backend-py && python main.py` (Python FastAPI backend on :3001)

## Architecture

### Frontend (React + Vite + TypeScript)

- **Single-page app** — one main route (`/`) in `frontend/src/pages/Index.tsx` which orchestrates the entire workflow
- **UI library**: shadcn/ui components in `frontend/src/components/ui/` (do not edit directly — use `npx shadcn-ui` to add/update)
- **Path alias**: `@/` maps to `src/` (configured in tsconfig and vite)
- **State management**: React state + `useLocalStorage` hook for persistence. No global store (Redux, Zustand, etc.)
- **Styling**: Tailwind CSS with CSS variables for theming (defined in `frontend/src/index.css`). Uses the `@tailwindcss/typography` plugin.

### Key Frontend Components (`frontend/src/components/`)

| Component | Purpose |
|---|---|
| `ChatInterface` | Main Q&A chat — sends questions (with the selected `model`) to `ask-question` API, displays answers with sources; hosts the model picker dropdown |
| `DownloadAssessment` | Two buttons that build a Word (`docx`) or PDF (`pdfmake`) working paper from the assessment JSON in a reply; renders nothing when no JSON is present |
| `FileUpload` | Drag-and-drop file upload → calls `upload-document` API |
| `DocumentList` | Lists uploaded docs with status, chunk counts, reprocess option |
| `SkillSelector` / `SkillManager` / `SkillCreatorDialog` | Browse, select, create, and manage expert skills (domain prompts) |
| `RagConfigPanel` | Toggle RAG skills (HyDE, query rewrite, decomposition, etc.) |
| `RetrievalConfigPanel` | Configure retrieval: reranking, fusion, hierarchical, self-RAG, CRAG |
| `IngestionConfigPanel` | Configure chunking strategy/size before upload |
| `OutputFormatPanel` | Choose output format (report HTML structure) |
| `POPIACompliancePanel` | Toggle PII detection/redaction settings |
| `ReportViewer` | Renders generated HTML reports with cumulative follow-up sections |
| `DocumentComparison` | Compare multiple documents side-by-side |

### Export module (`frontend/src/lib/`)

Client-side Word/PDF generation for IFRS 9 assessments: `assessmentTypes.ts` (schema), `extractAssessmentJson.ts` (parses + strips the `assessment-json` fenced block from a reply), `buildAssessmentDocx.ts` (`docx`), `buildAssessmentPdf.ts` (`pdfmake`). The `ask-question` route appends a `STRUCTURED EXPORT` JSON requirement on the questions-template prompt so replies carry the machine-readable block these consume. `ChatInterface` hides the JSON fence from displayed/copied text and shows the download buttons only when the block is present.

### Python Backend (FastAPI — `backend-py/`)

The backend lives in `backend-py/` and runs on FastAPI (port 3001). Uses native Python libraries for document parsing (pdfplumber, python-docx) with Gemini fallback for scanned PDFs.

**Routes** (`backend-py/routes/`):

| Route | Endpoint | Purpose |
|---|---|---|
| `upload_document.py` | `POST /api/upload-document` | Accepts multipart file, returns immediately with `{documentId, status:'processing'}`, processes in background (native parse → chunk → embed → store) |
| `ask_question.py` | `POST /api/ask-question` | Core RAG orchestrator. Vector similarity search, RAG skills pipeline, Gemini answer generation |
| `reprocess_document.py` | `POST /api/reprocess-document` | Re-chunks and re-embeds existing document in background |
| `create_skill.py` | `POST /api/create-skill` | AI skill generation via Gemini |
| `parse_prompt_document.py` | `POST /api/parse-prompt-document` | Parses uploaded prompt/knowledge documents |
| `documents.py` | `GET /api/documents/status`, `DELETE /api/documents/{id}` | Document status polling and deletion |
| `skills.py` | `GET/POST/PUT/DELETE /api/skills` | Full CRUD for expert skills |
| `configs.py` | `GET /api/configs/rag-presets`, `GET /api/configs/retrieval-presets` | Configuration preset listing |

**Services** (`backend-py/services/`):
- `supabase_client.py` — Singleton Supabase client using service role key
- `llm.py` — Provider-routing layer. `call_llm(prompt, llm, ...)` dispatches to Gemini or the Anthropic Messages API based on the model id; clamps Claude `max_tokens` per model and omits `temperature`/`thinking` for Claude. The `ask-question` route routes its user-visible generation (main answer, research, meta, report metadata) through this; auxiliary RAG skills + embeddings stay on Gemini.
- `gemini_client.py` — Shared Gemini REST API helper (generate_content, extract_json)
- `embeddings.py` — Gemini `gemini-embedding-001` embedding generation (768 dimensions via `outputDimensionality`)
- `document_parser.py` — Native Python parsing: pdfplumber (PDF), python-docx (DOCX), direct decode (TXT/JSON). Falls back to Gemini for scanned/image-based PDFs.
- `chunking.py` — Fixed, semantic, proposition, and hierarchical chunking strategies
- `popia_compliance.py` — PII detection and redaction for South African POPIA compliance
- `rag_skills.py` — HyDE, query rewriting, decomposition, verification, confidence scoring, reranking, fusion (RRF/weighted), self-RAG, corrective RAG, hierarchical chunk expansion

**Models** (`backend-py/models/`):
- `schemas.py` — Default config dicts (ingestion, output format, POPIA)

**Key design**: Upload and reprocess endpoints return immediately and process via FastAPI BackgroundTasks. The frontend poller detects status changes via `GET /api/documents/status`.

### Database (Supabase / PostgreSQL + pgvector)

Migrations in `supabase/migrations/`. Key tables:

- `documents` — uploaded document metadata (name, type, status, chunk count)
- `document_chunks` — chunked text with `vector(768)` embeddings. The `match_document_chunks` RPC function performs cosine similarity search.
- `skills` — expert prompt templates with optional question templates (JSONB)
- Various config tables for RAG, ingestion, and retrieval presets

RLS is enabled but currently allows all access (no auth).

### Environment Variables

The frontend has **no environment variables** — all configuration lives in the backend.

Python Backend (`backend-py/.env`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY` — for Gemini LLM and embedding API calls (always required)
- `ANTHROPIC_API_KEY` — optional, required only when a Claude model is selected; set it in the deployed backend's environment (e.g. Render) to enable the Claude options
- `LLAMA_CLOUD_API_KEY` — optional, for LlamaParse document parsing
- `PORT` — defaults to 3001

## Conventions

- TypeScript strict mode is relaxed: `noImplicitAny: false`, `strictNullChecks: false`
- `@typescript-eslint/no-unused-vars` is turned off
- Types for database tables are in `frontend/src/types/database.ts` and `frontend/src/types/rag-types.ts`
- **All database access goes through the Python API** — the frontend has no direct Supabase client
- Frontend calls the Python FastAPI backend via `apiFetch()` (GET/PUT/DELETE) and `apiCall()` (POST) from `frontend/src/lib/api.ts`
- Vite proxies `/api/*` to `localhost:3001` in development
- The Python backend uses plain dicts (not Pydantic response models) with camelCase keys to match frontend expectations
