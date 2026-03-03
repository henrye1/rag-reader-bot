# RFD: Document Q&A System with RAG-Powered Analysis

**Project Name:** Gemini RAG Bot - Document Q&A System
**Version:** 3.0
**Last Updated:** March 2026
**Status:** Production

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Architecture](#3-architecture)
4. [Core Features](#4-core-features)
5. [Database Schema](#5-database-schema)
6. [API Endpoints](#6-api-endpoints)
7. [Configuration System](#7-configuration-system)
8. [Skills & Expert System](#8-skills--expert-system)
9. [RAG Pipeline](#9-rag-pipeline)
10. [User Interface](#10-user-interface)
11. [Technology Stack](#11-technology-stack)
12. [Deployment](#12-deployment)
13. [Future Roadmap](#13-future-roadmap)
14. [Architecture Decision Records](#14-architecture-decision-records)

---

## 1. Executive Summary

The Document Q&A System is a sophisticated RAG (Retrieval Augmented Generation) powered application that enables users to upload documents and ask questions about their content. The system leverages Google's Gemini AI for intelligent document analysis, featuring advanced chunking strategies, configurable retrieval techniques, and a flexible expert skills system.

### Key Capabilities

- **Multi-format Document Support**: PDF, DOCX, TXT, JSON
- **Advanced RAG Pipeline**: HyDE, query decomposition, verification, confidence scoring
- **Expert Skills System**: Pre-built and AI-generated domain experts
- **Configurable Retrieval**: Fusion search, reranking, self-RAG, CRAG
- **Professional Output**: Audit-quality reports with citations
- **Second Brain Features**: Skill Creator, Generator Skills, Tool Connectors

---

## 2. Project Overview

### 2.1 Problem Statement

Organizations need to efficiently extract insights from large document collections. Traditional keyword search fails to understand context and nuance. Manual review is time-consuming and inconsistent.

### 2.2 Solution

A RAG-powered document analysis system that:
- Intelligently chunks and indexes documents
- Retrieves relevant context using vector similarity
- Generates accurate, cited answers using AI
- Applies domain expertise through configurable skills
- Produces professional-grade analysis reports

### 2.3 Target Users

- Financial analysts and auditors
- Compliance and risk management professionals
- Legal researchers
- Technical documentation teams
- Knowledge workers processing document-heavy workflows

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Frontend (React SPA — port 8080)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Upload  │ │  Skills  │ │   Chat   │ │  Report Viewer   │   │
│  │  Module  │ │ Selector │ │Interface │ │                  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
└───────┼────────────┼────────────┼────────────────┼─────────────┘
        │            │            │                │
        │       Vite proxy: /api/* → localhost:3001
        ▼            ▼            ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Python FastAPI Backend (port 3001)                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │   upload-    │ │     ask-     │ │    create-skill      │    │
│  │   document   │ │   question   │ │    reprocess-doc     │    │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘    │
│         │                │                    │                  │
│  ┌──────┴────────────────┴────────────────────┴───────────┐    │
│  │  Services: embeddings, chunking, parsing, RAG skills,  │    │
│  │  POPIA compliance, Gemini client, Supabase client       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────┼────────────────┼────────────────────┼────────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌──────────────────┐  ┌──────────────────────────────────┐    │
│  │   Google Gemini  │  │        Supabase PostgreSQL       │    │
│  │  - Embeddings    │  │  - pgvector for similarity       │    │
│  │  - Generation    │  │  - Document/Chunk storage        │    │
│  │  - PDF fallback  │  │  - Skills & configurations       │    │
│  └──────────────────┘  └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
Document Upload Flow:
File → Parse (pdfplumber/python-docx, Gemini fallback) → Chunk → Embed → Store in pgvector
       ↑ returns immediately with status:"processing", background task handles the rest

Query Flow:
Question → [Enhance] → Embed → Vector Search → [Rerank] → Generate Answer
                ↓                    ↓
           Query Rewrite        Fusion Search
           Decomposition        Self-RAG/CRAG
```

### 3.3 Component Interaction

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| Frontend | UI, state management, user interaction | React, shadcn-ui, Vite |
| Python Backend | Business logic, AI orchestration, file parsing | FastAPI, httpx, pdfplumber, python-docx |
| PostgreSQL | Data persistence, vector search | pgvector extension |
| Gemini API | Text generation, embeddings, scanned PDF extraction | Google Cloud |
| Supabase | Database hosting, RLS, RPC functions | Supabase platform |

---

## 4. Core Features

### 4.1 Document Management

| Feature | Description |
|---------|-------------|
| Multi-format upload | PDF, DOCX, TXT, JSON support |
| Processing status | Real-time status tracking |
| Reprocessing | Re-chunk with different configurations |
| Batch upload | Multiple documents simultaneously |
| Original text preservation | Stored for reprocessing |

### 4.2 Intelligent Chunking

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Fixed** | Character-based with overlap | General use, fast processing |
| **Semantic** | AI-detected natural boundaries | Narrative documents |
| **Proposition** | Atomic fact extraction | Fact-dense technical docs |
| **Hierarchical** | Parent-child relationships | Long documents, reports |

### 4.3 RAG Enhancements

| Technique | Description | Cost |
|-----------|-------------|------|
| **HyDE** | Generate hypothetical answer for better retrieval | +1 API call |
| **Query Rewrite** | Improve vague or ambiguous questions | +1 API call |
| **Decomposition** | Break complex questions into sub-queries | +1 API call |
| **Verification** | Check answer accuracy against sources | +1 API call |
| **Confidence** | Score answer reliability and coverage | +1 API call |
| **Reasoning** | Chain-of-thought analysis | Included |

### 4.4 Advanced Retrieval

| Technique | Description |
|-----------|-------------|
| **Fusion Search** | Combine semantic + keyword (BM25) search |
| **Reranking** | Cross-encoder or LLM-based relevance scoring |
| **Self-RAG** | Iterative retrieval with reflection |
| **CRAG** | Corrective RAG for low-relevance detection |
| **Hierarchical Expansion** | Include parent chunks for context |

### 4.5 Output Generation

| Format | Description |
|--------|-------------|
| **Narrative** | Flowing prose style |
| **Structured** | Headers and bullet points |
| **Tabular** | Emphasis on tables and data |
| **Audit** | Professional audit-quality format |

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
┌──────────────┐       ┌────────────────────┐
│  documents   │       │  document_chunks   │
├──────────────┤       ├────────────────────┤
│ id (PK)      │──────<│ document_id (FK)   │
│ name         │       │ id (PK)            │
│ file_type    │       │ chunk_index        │
│ status       │       │ content            │
│ total_chunks │       │ embedding (768-dim)│
│ ingestion_   │       │ token_count        │
│   config     │       └────────────────────┘
└──────────────┘

┌──────────────┐       ┌────────────────────┐
│    skills    │       │    rag_configs     │
├──────────────┤       ├────────────────────┤
│ id (PK)      │──────<│ id (PK)            │
│ name         │       │ name               │
│ skill_type   │       │ enable_hyde        │
│ output_format│       │ enable_verification│
│ prompt_content│      │ top_k              │
│ rag_config_id│───────│ similarity_thresh  │
└──────────────┘       └────────────────────┘

┌──────────────────┐
│ tool_connectors  │
├──────────────────┤
│ id (PK)          │
│ name             │
│ base_url         │
│ auth_type        │
│ actions (JSONB)  │
└──────────────────┘
```

### 5.2 Table Definitions

#### documents
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_file_id TEXT,
  original_extracted_text TEXT,
  total_chunks INTEGER DEFAULT 0,
  total_characters INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing', -- 'processing' | 'ready' | 'error'
  error_message TEXT,
  ingestion_config JSONB,
  last_reprocessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### document_chunks
```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding VECTOR(768), -- Gemini gemini-embedding-001 (outputDimensionality: 768)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);
```

#### skills
```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- NULL = global skill
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General',
  icon TEXT DEFAULT '🎯',
  prompt_content TEXT NOT NULL,
  questions_template JSONB,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  rag_config_id UUID REFERENCES rag_configs(id),
  skill_type TEXT DEFAULT 'expert', -- 'expert' | 'generator' | 'meta'
  output_format TEXT DEFAULT 'text', -- 'text' | 'markdown' | 'json'
  parent_skill_id UUID REFERENCES skills(id),
  tool_connector_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### rag_configs
```sql
CREATE TABLE rag_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enable_hyde BOOLEAN DEFAULT false,
  enable_query_rewrite BOOLEAN DEFAULT false,
  enable_decomposition BOOLEAN DEFAULT false,
  enable_verification BOOLEAN DEFAULT false,
  enable_confidence BOOLEAN DEFAULT false,
  enable_reasoning BOOLEAN DEFAULT false,
  top_k INTEGER DEFAULT 15,
  similarity_threshold FLOAT DEFAULT 0.3,
  is_preset BOOLEAN DEFAULT false,
  preset_category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### tool_connectors
```sql
CREATE TABLE tool_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🔌',
  connector_type TEXT DEFAULT 'http',
  base_url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none', -- 'none' | 'api_key' | 'bearer' | 'basic'
  auth_header_name TEXT DEFAULT 'Authorization',
  auth_value TEXT,
  default_headers JSONB DEFAULT '{}',
  timeout_ms INTEGER DEFAULT 30000,
  actions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.3 Custom Functions

#### Vector Similarity Search
```sql
CREATE FUNCTION match_document_chunks(
  query_embedding TEXT,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 15,
  filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  document_name TEXT,
  chunk_index INT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    d.name AS document_name,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding::vector) AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE d.status = 'ready'
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    AND 1 - (dc.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY dc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
```

---

## 6. API Endpoints

All endpoints are served by the Python FastAPI backend on port 3001. The frontend Vite dev server proxies `/api/*` requests to the backend.

### 6.1 upload-document

**Purpose:** Process and index uploaded documents

**Endpoint:** `POST /api/upload-document`

**Request:** Multipart form data
```
file: File (PDF, DOCX, TXT, JSON)
ingestionConfig: JSON string (optional) {
  chunking_strategy: 'fixed' | 'semantic' | 'proposition' | 'hierarchical',
  chunk_size: number,
  chunk_overlap: number,
  enable_context_enrichment: boolean,
  enable_metadata_extraction: boolean,
  enable_summary_chunks: boolean,
  extract_entities: boolean,
  preserve_tables: boolean,
  preserve_lists: boolean
}
```

**Response:**
```json
{
  "documentId": "uuid",
  "displayName": "filename.pdf",
  "status": "processing"
}
```

**Processing Pipeline (background task):**
1. Parse file (pdfplumber for PDF, python-docx for DOCX, Gemini fallback for scanned PDFs)
2. Extract and clean text
3. Apply chunking strategy
4. Generate embeddings in batches of 100 (Gemini `gemini-embedding-001`, 768 dims)
5. Store chunks with vectors in batches of 50
6. Update document status to `ready`

### 6.2 ask-question

**Purpose:** Answer questions using RAG

**Endpoint:** `POST /api/ask-question`

**Request:**
```typescript
{
  question: string,
  documentIds: string[],
  skillId?: string,
  skillType?: 'expert' | 'generator' | 'meta',
  skillName?: string,
  skillOutputFormat?: 'text' | 'markdown' | 'json',
  customPrompt?: string,
  ragConfig: {
    enableHyde: boolean,
    enableQueryRewrite: boolean,
    enableDecomposition: boolean,
    enableVerification: boolean,
    enableConfidence: boolean,
    enableReasoning: boolean,
    topK: number,
    similarityThreshold: number
  },
  retrievalConfig: {
    enableFullDocumentMode: boolean,
    fullDocumentMaxSize: number,
    enableReranking: boolean,
    rerankingMethod: 'cross-encoder' | 'llm',
    enableFusion: boolean,
    fusionStrategy: 'rrf' | 'weighted' | 'linear',
    enableSelfRag: boolean,
    selfRagMaxIterations: number,
    enableCrag: boolean,
    cragRelevanceThreshold: number
  },
  outputFormat: {
    style: 'narrative' | 'structured' | 'tabular' | 'audit',
    includeExecutiveSummary: boolean,
    citationFormat: 'inline' | 'detailed' | 'footnote',
    detailLevel: 'concise' | 'standard' | 'comprehensive'
  }
}
```

**Response:**
```typescript
{
  answer: string,
  reportHtml?: string,
  reportData?: object,
  sources: Array<{
    documentName: string,
    chunkIndex: number,
    similarity: number,
    preview: string
  }>,
  metadata?: {
    skillUsed: string,
    ragSkillsApplied: string[],
    retrievalTechniques: string[],
    confidence?: number,
    verified?: boolean
  }
}
```

### 6.3 create-skill

**Purpose:** AI-powered skill generation

**Endpoint:** `POST /api/create-skill`

**Request:**
```typescript
{
  description: string, // Natural language description
  saveSkill: boolean   // Whether to persist immediately
}
```

**Response:**
```typescript
{
  success: boolean,
  skill: {
    name: string,
    description: string,
    category: string,
    icon: string,
    skill_type: 'expert' | 'generator' | 'meta',
    output_format: 'text' | 'markdown' | 'json',
    prompt_content: string
  },
  reasoning: string,
  suggested_use_cases: string[],
  savedSkillId?: string
}
```

### 6.4 reprocess-document

**Purpose:** Re-chunk existing document with new configuration

**Endpoint:** `POST /api/reprocess-document`

**Request:**
```typescript
{
  documentId: string,
  ingestionConfig: IngestionConfig
}
```

### 6.5 parse-prompt-document

**Purpose:** Extract text from uploaded prompt files

**Endpoint:** `POST /api/parse-prompt-document`

**Request:**
```typescript
{
  file: File // TXT, JSON, PDF, or DOCX
}
```

---

## 7. Configuration System

### 7.1 Ingestion Configuration Presets

| Preset | Strategy | Chunk Size | Overlap | Enhancements |
|--------|----------|------------|---------|--------------|
| **Fast** | Fixed | 2000 | 200 | None |
| **Balanced** | Fixed | 1500 | 150 | Context + Metadata |
| **Accurate** | Semantic | 1000 | 100 | All enabled |
| **Financial** | Proposition | 800 | 80 | Entity extraction |
| **Legal** | Semantic | 1200 | 120 | Structure preservation |

### 7.2 RAG Configuration Presets

| Preset | HyDE | Rewrite | Decomp | Verify | Confidence | Reasoning |
|--------|------|---------|--------|--------|------------|-----------|
| **Default** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Enhanced** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Accurate** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 7.3 Retrieval Configuration Presets

| Preset | Full Doc | Rerank | Fusion | Self-RAG | CRAG |
|--------|----------|--------|--------|----------|------|
| **Fast** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Balanced** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Accurate** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Full Document** | ✅ | ❌ | ❌ | ❌ | ❌ |

### 7.4 Output Format Presets

| Preset | Style | Summary | Citations | Detail |
|--------|-------|---------|-----------|--------|
| **Simple** | Narrative | ❌ | Inline | Concise |
| **Standard** | Structured | ✅ | Detailed | Standard |
| **Detailed** | Structured | ✅ | Detailed | Comprehensive |
| **Audit** | Audit | ✅ | Footnote | Comprehensive |

---

## 8. Skills & Expert System

### 8.1 Skill Types

| Type | Description | Output |
|------|-------------|--------|
| **Expert** | Domain-specific knowledge and analysis | Text/Markdown |
| **Generator** | Structured document generation | JSON/Markdown |
| **Meta** | System-level operations (e.g., skill creation) | JSON |

### 8.2 Skill Categories

- Financial Regulation
- Risk Management
- Compliance
- Audit
- Legal
- Technical
- Operations
- Document Generation
- Research
- Meta
- Custom

### 8.3 Pre-built Generator Skills

| Skill | Description | Output Format |
|-------|-------------|---------------|
| **Skill Creator** | AI-powered skill generation | JSON |
| **SOP Creator** | Standard Operating Procedure generation | Markdown |
| **Brand Voice Generator** | Brand voice and style guide extraction | Markdown |
| **PPTX Generator** | PowerPoint presentation outlines | JSON |
| **Script Writer** | Video/presentation/meeting scripts | Markdown |
| **Reference Manager** | Citation extraction and formatting | Markdown |

### 8.4 Skill Prompt Structure

```markdown
You are an expert in [DOMAIN]. Your expertise includes:

## Core Competencies:
- [Area 1]: [Description]
- [Area 2]: [Description]

## Assessment Framework:
When analyzing documents, evaluate:
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]

## Response Guidelines:
- [Style guideline 1]
- [Style guideline 2]
- Always cite specific sections from documents
- Provide actionable insights and recommendations

## Key Considerations:
- [Important factor 1]
- [Important factor 2]
- [Relevant standards/regulations]
```

---

## 9. RAG Pipeline

### 9.1 Document Ingestion Pipeline

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Upload  │───>│  Parse  │───>│  Chunk  │───>│  Embed  │───>│  Store  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                   │              │              │
                   ▼              ▼              ▼
              pdfplumber     Strategy:      Gemini API
              python-docx    - Fixed        gemini-embedding-001
              (Gemini        - Semantic     768 dims (outputDimensionality)
               fallback      - Proposition  Batch: 100/request
               for scanned   - Hierarchical
               PDFs)
```

### 9.2 Query Processing Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Query   │───>│ Enhance  │───>│  Search  │───>│  Rank    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                    │               │               │
                    ▼               ▼               ▼
               - HyDE          - Vector        - Reranking
               - Rewrite       - Keyword       - Fusion
               - Decompose     - Hybrid

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Retrieve │───>│ Generate │───>│  Verify  │───>│  Format  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
 - Self-RAG      Gemini API     - Accuracy      - Style
 - CRAG          + Context      - Confidence    - Citations
 - Hierarchical  + Skill                        - HTML Report
```

### 9.3 Embedding Strategy

- **Model:** Gemini `gemini-embedding-001` (successor to `text-embedding-004`, retired Feb 2026)
- **Dimensions:** 768 (via `outputDimensionality` parameter; model default is 3072)
- **Task types:** `RETRIEVAL_DOCUMENT` for indexing, `RETRIEVAL_QUERY` for search queries
- **Batch Size:** Up to 100 texts per request (recursive batching for larger sets)
- **Similarity:** Cosine distance via pgvector (`<=>` operator)

### 9.4 Retrieval Strategies

#### Vector Search (Default)
```sql
SELECT *, 1 - (embedding <=> query_embedding) AS similarity
FROM document_chunks
WHERE similarity > threshold
ORDER BY embedding <=> query_embedding
LIMIT top_k;
```

#### Fusion Search (Hybrid)
- Semantic: Vector similarity
- Keyword: BM25 text matching
- Combination: RRF, Weighted, or Linear fusion

#### Self-RAG (Iterative)
1. Initial retrieval
2. Generate preliminary answer
3. Reflect on quality
4. Additional retrieval if needed
5. Iterate until confident or max iterations

#### CRAG (Corrective)
1. Retrieve chunks
2. Score relevance
3. If low relevance: refine query or expand search
4. Generate with verified context

---

## 10. User Interface

### 10.1 Main Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Document Q&A                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Upload Documents                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  📄 Drop files here or click to upload                     │ │
│  │     Supports: PDF, DOCX, TXT, JSON                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Step 2: Select Expert Skill                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  🧠 Financial Analyst  ▼  [AI Generate] [Manage]           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Step 3: Ask Questions                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  💬 Chat Interface with messages and sources               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Component Hierarchy

```
Index.tsx
├── FileUpload
├── DocumentList
├── SkillSelector
│   └── SkillManager (dialog)
│       └── SkillCreatorDialog
├── RagConfigPanel
├── RetrievalConfigPanel
├── OutputFormatPanel
├── ChatInterface
│   ├── ChatExpertSelector
│   ├── ChunkSources
│   ├── RagMetadataBadges
│   └── GeneratorOutput
├── ReportViewer
└── ReprocessDialog
```

### 10.3 Key UI Components

| Component | Purpose |
|-----------|---------|
| `FileUpload` | Drag-and-drop file upload |
| `DocumentList` | Display uploaded documents with status |
| `SkillSelector` | Dropdown for expert selection |
| `SkillManager` | CRUD operations for skills |
| `SkillCreatorDialog` | AI skill generation wizard |
| `ChatInterface` | Main Q&A interaction |
| `ChatExpertSelector` | Per-message expert switching |
| `ChunkSources` | Citation display |
| `ReportViewer` | HTML report display |
| `GeneratorOutput` | Structured output renderer |
| `RagConfigPanel` | RAG skill toggles |
| `RetrievalConfigPanel` | Advanced retrieval settings |
| `OutputFormatPanel` | Output style configuration |

---

## 11. Technology Stack

### 11.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 5.4.19 | Build tool |
| React Router | 6.30.1 | Routing |
| TanStack Query | 5.83.0 | Server state |
| React Hook Form | 7.61.1 | Form handling |
| Zod | 3.25.76 | Validation |

### 11.2 UI Components

| Technology | Purpose |
|------------|---------|
| shadcn-ui | Component library |
| Radix UI | Accessible primitives |
| Tailwind CSS | Styling |
| Lucide React | Icons |
| Recharts | Charts |
| Sonner | Notifications |

### 11.3 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.13 | Runtime |
| FastAPI | 0.115.6 | Web framework |
| Uvicorn | 0.34.0 | ASGI server |
| supabase-py | 2.28.0 | Supabase client |
| httpx | 0.28.1 | HTTP client (Gemini API calls) |
| pdfplumber | 0.11.4 | PDF text extraction |
| python-docx | 1.1.2 | DOCX text extraction |

### 11.4 Data Layer

| Technology | Purpose |
|------------|---------|
| Supabase | Database hosting, auth, RPC functions |
| PostgreSQL | Relational database |
| pgvector | Vector similarity search |

### 11.5 External Services

| Service | Purpose |
|---------|---------|
| Google Gemini API (`gemini-2.5-pro`) | Text generation, answer synthesis, skill creation |
| Google Gemini API (`gemini-2.5-flash`) | Scanned PDF text extraction (fallback) |
| Google Gemini API (`gemini-embedding-001`) | Embedding generation (768 dims) |

---

## 12. Deployment

### 12.1 Environment Variables

```bash
# The frontend has NO environment variables.
# All configuration lives in the Python backend.

# Python Backend — backend-py/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_API_KEY=your-gemini-api-key
PORT=3001
```

### 12.2 Database Setup

1. Create Supabase project
2. Enable pgvector extension
3. Run migration scripts in `supabase/migrations/`

### 12.3 Backend Deployment

```bash
# Install Python dependencies
cd backend-py
python -m venv .venv
.venv/Scripts/activate   # Windows (.venv/bin/activate on Linux/Mac)
pip install -r requirements.txt

# Start the backend
python main.py   # Runs on port 3001
```

### 12.4 Frontend Development

```bash
cd frontend
npm install
npm run dev   # Runs on port 8080, proxies /api/* to :3001
```

### 12.5 Platform Integration

The project was originally scaffolded with Lovable platform:
- **Project URL:** `https://lovable.dev/projects/13af4cb5-9f84-4979-8adc-a9ad76a849ff`

---

## 13. Future Roadmap

### 13.1 Phase 1: Tool Connectors (In Progress)

- [ ] Tool Connector Manager UI
- [ ] External API integration framework
- [ ] Action execution engine
- [ ] Skill-to-connector linking

### 13.2 Phase 2: Enhanced Collaboration

- [ ] User authentication
- [ ] Shared workspaces
- [ ] Document permissions
- [ ] Collaboration features

### 13.3 Phase 3: Advanced Analytics

- [ ] Usage analytics dashboard
- [ ] Query performance metrics
- [ ] Skill effectiveness tracking
- [ ] Cost optimization insights

### 13.4 Phase 4: Enterprise Features

- [ ] SSO integration
- [ ] Audit logging
- [ ] Data retention policies
- [ ] Custom model endpoints

---

## Appendix A: API Cost Estimation

| Operation | API Calls | Estimated Cost |
|-----------|-----------|----------------|
| Document upload (1MB PDF) | 2-5 | $0.01-0.05 |
| Basic question | 2 | $0.01-0.02 |
| Enhanced question (all skills) | 7-8 | $0.05-0.10 |
| Skill generation | 1-2 | $0.02-0.05 |

## Appendix B: Performance Benchmarks

| Metric | Target | Typical |
|--------|--------|---------|
| Document processing | < 30s/MB | 10-20s/MB |
| Query response | < 5s | 2-4s |
| Vector search | < 100ms | 20-50ms |
| Skill generation | < 10s | 5-8s |

---

## 14. Architecture Decision Records

### ADR-001: Migration from Supabase Edge Functions to Python FastAPI Backend

**Date:** March 2026
**Status:** Accepted

**Context:** Supabase Edge Functions (Deno runtime) frequently hit wall-time limits when processing large document uploads. The chunking, embedding, and storage pipeline for a single document could exceed the function's maximum execution time, causing uploads to fail silently.

**Decision:** Replace Supabase Edge Functions with a Python FastAPI backend running on port 3001. The backend uses FastAPI `BackgroundTasks` for fire-and-forget document processing, avoiding timeout issues entirely.

**Consequences:**
- Upload and reprocess endpoints return immediately; processing happens in the background
- No Deno/Supabase function deployment needed; backend runs as a standard Python process
- Supabase is retained as database only (PostgreSQL + pgvector)
- The old Node.js Express backend (`backend/`) and `supabase/functions/` directory have been deleted

---

### ADR-002: Native Document Parsing with Gemini Fallback

**Date:** March 2026
**Status:** Accepted

**Context:** The original system used the Gemini Files API for all document parsing, which added network latency, LLM cost, and API rate limit pressure for every upload. Most documents are text-based PDFs or DOCX files that don't need AI to extract text.

**Decision:** Use native Python libraries as the primary parsing layer:
- `pdfplumber` for text-based PDFs (including table extraction)
- `python-docx` for DOCX files (including table extraction)
- Direct UTF-8 decode for TXT and JSON files
- **Gemini `gemini-2.5-flash` fallback** for scanned/image-based PDFs where pdfplumber finds no text

**Consequences:**
- Text-based document parsing is instant (no network calls)
- Scanned PDFs still work via Gemini's vision capabilities
- Reduced API costs for the majority of uploads
- No dependency on external parsing services (LlamaParse removed as requirement)

---

### ADR-003: Embedding Model Migration to `gemini-embedding-001`

**Date:** March 2026
**Status:** Accepted

**Context:** Google retired the `text-embedding-004` model from the Gemini API in February 2026. The replacement model `gemini-embedding-001` defaults to 3072 dimensions, but the existing database uses `vector(768)` columns.

**Decision:** Use `gemini-embedding-001` with `outputDimensionality: 768` to maintain compatibility with the existing database schema. Use distinct task types: `RETRIEVAL_DOCUMENT` for indexing and `RETRIEVAL_QUERY` for search queries.

**Consequences:**
- Zero database migration needed (768-dim vectors remain compatible)
- Embedding quality may differ slightly from the retired model
- All existing embeddings remain valid and searchable
- New documents are embedded with the same dimensionality

---

### ADR-004: Supabase Client Library Upgrade (v2.11.0 to v2.28.0)

**Date:** March 2026
**Status:** Accepted

**Context:** Supabase introduced a new API key format (`sb_publishable_...` / `sb_secret_...`) replacing the older JWT-style keys. The `supabase-py` v2.11.0 library did not recognize the new format and rejected it as "Invalid API key".

**Decision:** Upgrade `supabase-py` from v2.11.0 to v2.28.0 which supports the new key format.

**Consequences:**
- Backend can authenticate with both old and new Supabase key formats
- Several transitive dependencies were also upgraded
- `requirements.txt` updated to pin `supabase==2.28.0`

---

**Document Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | System | Initial release |
| 2.0 | 2026-01 | System | Second Brain features, Generator Skills |
| 3.0 | 2026-03 | System | Python FastAPI backend migration, native document parsing, embedding model update, ADRs |
