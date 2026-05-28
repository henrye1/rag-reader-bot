# Document Q&A System - User Manual

A RAG-powered document analysis system with advanced vector search capabilities.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Application Workflow](#application-workflow)
3. [Configuration Panels](#configuration-panels)
   - [Ingestion Configuration](#ingestion-configuration)
   - [Query Configuration](#query-configuration)
   - [Retrieval Configuration](#retrieval-configuration)
4. [Skills Reference](#skills-reference)
5. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm (for the frontend)
- Python 3.11+ (for the backend)
- Supabase project with pgvector extension enabled
- Google Gemini API key

### Running the Application

1. **Start the Python backend:**
   ```bash
   cd backend-py
   python -m venv .venv
   .venv/Scripts/activate       # Windows (.venv/bin/activate on Linux/Mac)
   pip install -r requirements.txt
   python main.py               # Runs on port 3001
   ```

2. **Start the frontend (in a separate terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev                  # Runs on port 8080
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8080`

### Environment Setup

Configure `backend-py/.env` with your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GOOGLE_API_KEY`. Optionally add `ANTHROPIC_API_KEY` to enable the Claude model options.

---

## Application Workflow

The application follows a 3-step workflow:

### Step 1: Upload Documents

1. Configure ingestion settings (optional)
2. Drag and drop or click to select files
3. Supported formats: PDF, DOCX, TXT, JSON
4. Wait for processing to complete (status shows "Ready")

### Step 2: Select Expert Skill

Choose how the AI should analyze your documents:

- **Pre-built Skills**: Domain-specific expertise (Financial, Legal, etc.)
- **Custom Upload**: Upload your own system prompt
- **No Skill**: Use default RAG without specialized knowledge

### Step 3: Ask Questions

- Type questions in the chat interface
- Optionally upload a question template for batch processing
- View source citations with each answer

#### Choosing a model

Use the **model dropdown** in the chat header (next to the expert selector) to choose which AI generates the answer:

- **Gemini 2.5 Pro** (default) — always available
- **Claude Opus 4.7** — most capable
- **Claude Sonnet 4.6** — balanced speed/quality
- **Claude Haiku 4.5** — fastest / lowest cost

The choice is remembered per browser and applies to your next question. Claude options require the server's `ANTHROPIC_API_KEY` to be configured; if it isn't, picking a Claude model returns a clear error and you can switch back to Gemini.

#### Downloading an assessment (Word / PDF)

When you run a structured assessment (with a question template), the reply includes **Download as Word** and **Download as PDF** buttons. Click either to generate a formatted working-paper document in your browser — no server round-trip. The buttons only appear on assessment responses; ordinary chat replies don't show them.

---

## Configuration Panels

### Ingestion Configuration

**When to configure:** Before uploading documents

Controls how documents are processed and stored in the vector database.

#### Presets

| Preset | Best For | Processing Cost |
|--------|----------|-----------------|
| **Fast** | Quick testing, simple documents | 1x |
| **Balanced** | General use, mixed documents | 1.7x |
| **Accurate** | Complex documents, high accuracy needs | 3x |
| **Financial** | Financial reports, regulations | 3x |
| **Legal** | Contracts, legal documents | 2.7x |

#### Chunking Strategies

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Fixed** | Splits text at fixed character intervals with overlap | Fast processing, simple documents |
| **Semantic** | Uses AI to find natural topic boundaries | Complex documents, better retrieval quality |
| **Proposition** | Breaks text into atomic factual statements | Fact-dense documents (financial, scientific) |
| **Hierarchical** | Creates parent-child chunk relationships | Long documents, need context expansion |

#### Enhancement Options

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Context Enrichment** | Adds surrounding text to each chunk | +0.5x cost, better context |
| **Metadata Extraction** | Extracts section titles, headings | +0.2x cost, better navigation |
| **Summary Chunks** | Generates summary for each section | +0.5x cost, overview answers |
| **Extract Entities** | Identifies named entities (people, orgs, dates) | +0.3x cost, entity queries |

#### Advanced Settings

- **Chunk Size**: Target size in characters (500-4000)
  - Smaller = more precise retrieval
  - Larger = more context per chunk

- **Chunk Overlap**: Characters shared between adjacent chunks (0-500)
  - Higher = better continuity
  - Lower = less redundancy

---

### Query Configuration

**When to configure:** Before asking questions

Controls how questions are processed and enhanced before searching.

#### Presets

| Preset | Skills Enabled | API Calls | Best For |
|--------|----------------|-----------|----------|
| **Default** | None | 1 | Simple fact lookup |
| **Fast** | None | 1 | Quick answers |
| **Enhanced** | All except Reasoning | 4-5 | Thorough analysis |
| **Accurate** | All | 5-6 | Critical accuracy |

#### Query Skills

| Skill | Description | API Calls | When Useful |
|-------|-------------|-----------|-------------|
| **Query Rewrite** | Improves vague or poorly-formed questions | +1 | Unclear questions, typos |
| **HyDE** | Generates hypothetical answer to guide search | +1 | Abstract or conceptual questions |
| **Decomposition** | Breaks complex questions into sub-questions | +1 | Multi-part questions |
| **Verification** | Checks answer against source documents | +1 | High-stakes answers |
| **Confidence** | Scores answer confidence with reasoning | +1 | Understanding reliability |
| **Reasoning** | Enables chain-of-thought for complex analysis | +0 | Analytical questions |

#### Skill Details

**Query Rewrite**
- Transforms: "what r the reqs?" → "What are the requirements for..."
- Best for: Informal queries, abbreviations, vague questions

**HyDE (Hypothetical Document Embeddings)**
- Generates a hypothetical ideal answer first
- Uses that to find similar real content
- Best for: Abstract questions, when keywords don't match

**Decomposition**
- Splits "Compare A and B and explain the implications" into:
  1. "What is A?"
  2. "What is B?"
  3. "What are the implications of both?"
- Best for: Complex analytical questions

**Verification**
- Cross-checks answer claims against source chunks
- Flags unsupported statements
- Returns severity: none, minor, major

**Confidence Scoring**
- Evaluates: source coverage, answer completeness, potential gaps
- Returns: High/Medium/Low with explanation
- Best for: Understanding answer reliability

---

### Retrieval Configuration

**When to configure:** Before asking questions

Controls how documents are searched and results are processed.

#### Presets

| Preset | Features | Latency | Best For |
|--------|----------|---------|----------|
| **Fast** | None | Low | Quick lookups |
| **Balanced** | Reranking + Fusion | Medium | General use |
| **Accurate** | All features | High | Maximum accuracy |
| **Questionnaire** | Optimized for batch | Medium-High | Multiple questions |

#### Retrieval Skills

| Skill | Description | Latency Impact |
|-------|-------------|----------------|
| **Reranking** | Re-scores results with more accurate model | Medium |
| **Fusion Retrieval** | Combines semantic + keyword search | Low |
| **Hierarchical** | Expands to parent chunks for context | Low |
| **Self-RAG** | Iteratively improves retrieval quality | High |
| **CRAG** | Detects and corrects poor retrieval | Medium |
| **Feedback Loop** | Learns from query patterns over time | None |

#### Skill Details

**Reranking**
- Models: Cross-Encoder (accurate), LLM-Rerank (flexible)
- Rerank Top N: How many results to re-score (5-30)
- Best for: Improving relevance ranking

**Fusion Retrieval**
- Strategies:
  - **RRF** (Reciprocal Rank Fusion): Balanced combination
  - **Weighted**: Custom weights for semantic vs keyword
  - **Linear**: Simple linear combination
- Weights: Adjust semantic (vector) vs keyword (BM25) importance

**Hierarchical Retrieval**
- Requires hierarchical chunking during ingestion
- Expand to Parent: Include parent context with child matches
- Max Depth: How many levels up to expand (1-3)

**Self-RAG (Self-Reflective RAG)**
- Iteratively improves retrieval based on result quality
- Max Iterations: 1-5 improvement cycles
- Quality Threshold: Stop when quality exceeds this (0.3-0.8)
- Best for: Maximum accuracy, complex queries

**CRAG (Corrective RAG)**
- Detects when initial retrieval is poor quality
- Relevance Threshold: Below this triggers correction (0.2-0.6)
- Web Fallback: Search web if documents insufficient
- Best for: Handling edge cases, incomplete documents

---

## Skills Reference

### Quick Selection Guide

| Document Type | Ingestion | Query | Retrieval |
|---------------|-----------|-------|-----------|
| Simple FAQ | Fast | Default | Fast |
| Technical Manual | Balanced | Query Rewrite + HyDE | Balanced |
| Financial Report | Financial | All skills | Accurate |
| Legal Contract | Legal | Verification + Confidence | Accurate |
| Research Paper | Accurate | Decomposition + Reasoning | Accurate |
| Mixed Documents | Balanced | HyDE + Confidence | Balanced |

### Cost vs Accuracy Trade-offs

| Priority | Ingestion | Query Skills | Retrieval |
|----------|-----------|--------------|-----------|
| **Speed** | Fast preset, Fixed chunking | None | Fast preset |
| **Balance** | Balanced preset | Query Rewrite, Confidence | Balanced preset |
| **Accuracy** | Accurate preset, Semantic chunking | All skills | Accurate preset |

---

## Troubleshooting

### Common Issues

**Document won't upload**
- Check file format (PDF, DOCX, TXT, JSON)
- Ensure file isn't corrupted
- Check Supabase Edge Function logs

**Poor search results**
- Try enabling HyDE for better semantic matching
- Enable Fusion Retrieval for combined search
- Increase Top K in query settings
- Lower similarity threshold

**Answers seem incomplete**
- Enable Decomposition for complex questions
- Try hierarchical chunking with parent expansion
- Enable Self-RAG for iterative improvement

**Slow responses**
- Reduce enabled skills
- Use Fast presets
- Lower rerank_top_n
- Disable Self-RAG iterations

### Reprocessing Documents

If you need different chunking settings for existing documents:

1. Click the refresh icon on a document in the list
2. Select new ingestion settings
3. Click "Reprocess Document"

Note: Only works for documents uploaded after the reprocessing feature was added.

---

## Technical Notes

### Vector Dimensions
- Embedding model: Google text-embedding-004
- Dimensions: 768
- Similarity: Cosine distance via pgvector

### API Usage
- Each query skill adds approximately 1 API call
- Self-RAG multiplies calls by iteration count
- Reranking uses additional model call

### Storage
- Original text preserved for reprocessing
- Chunks stored with embeddings in Supabase
- Configuration saved in localStorage + database

---

*For additional help, refer to the project README or contact support.*
