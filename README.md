# Gemini RAG Bot - Document Q&A System

RAG-powered Document Q&A system built with React + Python FastAPI + Supabase (pgvector). Upload documents, ask questions, get AI-generated answers with citations.

Originally scaffolded with [Lovable](https://lovable.dev/projects/13af4cb5-9f84-4979-8adc-a9ad76a849ff).

## Features

- **Multi-format document upload** (PDF, DOCX, TXT, JSON) with native parsing + Gemini fallback for scanned PDFs
- **Advanced RAG pipeline**: HyDE, query rewriting, decomposition, verification, confidence scoring
- **Configurable chunking**: fixed, semantic, proposition, hierarchical strategies
- **Advanced retrieval**: fusion search (RRF/weighted), reranking, self-RAG, corrective RAG
- **Expert skills system**: pre-built and AI-generated domain-specific prompts
- **Multi-model generation**: pick Gemini 2.5 Pro or Claude (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) per conversation from the chat header
- **In-app export**: download IFRS 9 assessments as formatted Word (.docx) or PDF working papers, generated client-side
- **POPIA compliance**: PII detection and redaction for South African regulations
- **Professional reports**: audit-quality HTML output with citations

## Architecture

```
rag-reader-bot/
├── frontend/        React + Vite + TypeScript (port 8080)
├── backend-py/      Python FastAPI backend (port 3001)
├── supabase/        Migrations and config (database only)
├── RFD.md           Design document with ADRs
└── CLAUDE.md        AI assistant instructions
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- Supabase project with pgvector enabled

### Setup

```bash
# 1. Clone and configure environment
cp backend-py/.env.example backend-py/.env   # Add your keys
cp frontend/.env.example frontend/.env       # Add Supabase public keys

# 2. Install and start Python backend
cd backend-py
python -m venv .venv
.venv/Scripts/activate       # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python main.py               # Runs on port 3001

# 3. In a separate terminal, start frontend
cd frontend
npm install
npm run dev                  # Runs on port 8080, proxies /api to :3001
```

### Environment Variables

**Backend** (`backend-py/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_API_KEY=your-gemini-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key   # optional — only needed to use Claude models
PORT=3001
```

> When deployed (e.g. Render), set `ANTHROPIC_API_KEY` in the backend service's environment. Gemini works without it; selecting a Claude model without it returns a clear "ANTHROPIC_API_KEY is not configured" error.

**Frontend** (`frontend/.env`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Python 3.13, FastAPI, Uvicorn, httpx |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | Google Gemini (gemini-2.5-pro, gemini-embedding-001) + Anthropic Claude (Opus 4.7, Sonnet 4.6, Haiku 4.5) |
| Document Parsing | pdfplumber, python-docx, Gemini fallback |
| Document Export | docx, pdfmake (client-side Word/PDF generation) |

## Documentation

- [CLAUDE.md](CLAUDE.md) — Developer guide and codebase conventions
- [RFD.md](RFD.md) — Full design document with architecture, API specs, and ADRs
- [USER_MANUAL.md](USER_MANUAL.md) — End-user documentation
