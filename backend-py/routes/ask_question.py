"""POST /api/ask-question — Main RAG orchestrator.

Modes: research, meta-skill, full-document, standard RAG.
Pipeline: pre-retrieval skills -> vector search -> post-retrieval skills -> Gemini generation.
"""

import os
import re
import time
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client
from services.embeddings import generate_query_embedding
from services.gemini_client import extract_json
from services.llm import call_llm, DEFAULT_MODEL
from services.popia_compliance import detect_pii, redact_pii, create_audit_entry
from services.rag_skills import (
    DEFAULT_RAG_CONFIG,
    DEFAULT_RETRIEVAL_CONFIG,
    REASONING_PROMPT,
    generate_hypothetical_answer,
    rewrite_query,
    decompose_question,
    verify_answer,
    assess_confidence,
    is_complex_question,
    rerank_chunks,
    keyword_search,
    fusion_rrf,
    fusion_weighted,
    self_rag,
    corrective_rag,
    expand_to_parent_chunks,
)
from models.schemas import DEFAULT_OUTPUT_FORMAT, DEFAULT_POPIA_CONFIG

router = APIRouter()


def _build_output_format_instructions(config: dict) -> str:
    instructions: list[str] = []

    style = config.get("output_style", "structured")
    if style == "narrative":
        instructions.append("""## OUTPUT STYLE: Narrative
- Write in flowing prose with natural paragraph transitions
- Avoid excessive bullet points - prefer complete sentences
- Integrate citations smoothly into the text""")
    elif style == "structured":
        instructions.append("""## OUTPUT STYLE: Structured
- Use clear section headers and subheaders
- Use bullet points for lists of findings
- Organize by topic or document source
- Use bold text for key terms and findings""")
    elif style == "tabular":
        instructions.append("""## OUTPUT STYLE: Tabular
- Present findings in well-formatted tables where appropriate
- Use markdown tables: | Header 1 | Header 2 |
- Include summary tables for comparisons
- Use bullet points for non-tabular content""")
    elif style == "audit":
        instructions.append("""## OUTPUT STYLE: Audit-Quality Professional Format
- Structure response as a formal assessment document
- Begin with an EXECUTIVE SUMMARY section containing:
  - Key findings summary
  - Critical metrics or indicators
  - High-level conclusions
- Follow with DETAILED ANALYSIS section containing:
  - Document-by-document breakdown
  - Extracted data tables with model parameters, coefficients, statistics
  - Cross-references between documents
- Include METHODOLOGY section if relevant
- End with CONCLUSIONS and RECOMMENDATIONS
- Use formal, third-person professional tone
- Format all numerical data in properly aligned tables""")

    detail = config.get("response_detail_level", "standard")
    if detail == "concise":
        instructions.append("""## RESPONSE LENGTH: Concise
- Provide brief, focused answers (2-4 paragraphs max)
- Focus only on the most relevant information
- Omit lengthy explanations - be direct""")
    elif detail == "standard":
        instructions.append("""## RESPONSE LENGTH: Standard
- Provide balanced, thorough responses
- Include relevant context and explanation
- Cover key points without excessive detail""")
    elif detail == "comprehensive":
        instructions.append("""## RESPONSE LENGTH: Comprehensive
- Provide detailed, exhaustive analysis
- Cover all relevant aspects found in the documents
- Include background context and nuanced explanations
- Do not abbreviate or summarize unnecessarily
- Extract and present ALL relevant data, tables, and statistics""")

    citation = config.get("citation_format", "inline")
    if citation == "inline":
        instructions.append("""## CITATION FORMAT: Inline Brief
- Use brief inline citations: [Source: Document Name]
- Place citations at the end of relevant statements""")
    elif citation == "detailed":
        instructions.append("""## CITATION FORMAT: Detailed with Location
- Use detailed citations: [Source: Document Name, Section: X, Page: Y, Chunk: Z]
- Include section/page references where available
- Quote exact text in quotation marks when appropriate
- Example: "The model uses a 12-month PD horizon" [Source: IFRS9 Model.pdf, Section: Methodology, Chunk: 5]""")
    elif citation == "footnote":
        instructions.append("""## CITATION FORMAT: Footnote Style
- Number citations sequentially: [1], [2], etc.
- Include a REFERENCES section at the end listing all sources
- Format: [1] Document Name - Section X - Summary of content""")

    structure_opts: list[str] = []
    if config.get("include_executive_summary"):
        structure_opts.append("- Begin with an EXECUTIVE SUMMARY section (3-5 bullet points of key findings)")
    if config.get("include_per_document_analysis"):
        structure_opts.append("- Provide PER-DOCUMENT ANALYSIS with dedicated sections for each source document")
    if config.get("include_cross_references"):
        structure_opts.append("- Include CROSS-REFERENCES section showing how documents relate to each other")
    if structure_opts:
        instructions.append("## STRUCTURE REQUIREMENTS:\n" + "\n".join(structure_opts))

    extraction_opts: list[str] = []
    if config.get("extract_tables"):
        extraction_opts.append("- EXTRACT and reproduce all tables found in the documents in markdown format")
    if config.get("extract_statistics"):
        extraction_opts.append("- EXTRACT all statistical measures (R², p-values, AUC, Gini, accuracy metrics, etc.)")
        extraction_opts.append("- Present statistics in a dedicated STATISTICAL SUMMARY table")
    if config.get("extract_model_parameters"):
        extraction_opts.append("- EXTRACT all model parameters, coefficients, weights, and thresholds")
        extraction_opts.append("- Present in a MODEL PARAMETERS table with columns: Parameter | Value | Description")
    if extraction_opts:
        instructions.append("## DATA EXTRACTION REQUIREMENTS:\n" + "\n".join(extraction_opts))

    ref_opts: list[str] = []
    if config.get("include_page_numbers"):
        ref_opts.append("- Include page numbers in citations where available")
    if config.get("include_section_references"):
        ref_opts.append('- Include section/heading references (e.g., "Section 3.2: Methodology")')
    if ref_opts:
        instructions.append("## REFERENCE DETAIL:\n" + "\n".join(ref_opts))

    return "\n\n".join(instructions)


def _format_analysis_content(answer: str) -> str:
    html = answer
    # Strip source citations
    html = re.sub(r"\[Source:\s*[^\]]+\]", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\[Chunk\s*\d+[^\]]*\]", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\(Source:\s*[^)]+\)", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\s{2,}", " ", html)
    html = re.sub(r"\n\s*\n\s*\n", "\n\n", html)

    # Markdown -> HTML
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^# (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"^\s*[-*]\s+(.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
    html = re.sub(r"(<li>.*?</li>\n?)+", r"<ul>\g<0></ul>", html)
    html = html.replace("\n\n", "</p><p>")
    html = "<p>" + html + "</p>"
    html = re.sub(r"<p>\s*</p>", "", html)
    html = re.sub(r"<p>\s*<h", "<h", html)
    html = re.sub(r"</h([23])>\s*</p>", r"</h\1>", html)

    return html


async def _generate_report_context(answer: str, question: str, doc_names: list[str], custom_prompt: str | None, llm: dict) -> dict:
    prompt = f"""Based on the following analysis, generate report metadata:

ANALYSIS:
{answer[:1500]}

QUESTION:
{question}

CONTEXT:
{custom_prompt or 'General document analysis'}

DOCUMENTS: {len(doc_names)}

Generate JSON:
{{
  "reportTitle": "Short title",
  "reportType": "Analysis type",
  "entityName": "Main subject",
  "reportDescription": "Brief description",
  "keyMetrics": [{{"label": "Metric", "value": "Value", "status": "positive/neutral/negative/info"}}],
  "summary": "2-3 sentence summary"
}}

Respond with ONLY the JSON."""

    try:
        result = await call_llm(prompt, llm, temperature=0.3)
        parsed = extract_json(result)
        if parsed and isinstance(parsed, dict):
            return parsed
    except Exception as e:
        print(f"Error generating report context: {e}")

    return {
        "reportTitle": "Document Analysis Report",
        "reportType": "General Analysis",
        "entityName": doc_names[0] if len(doc_names) == 1 else f"{len(doc_names)} Documents",
        "reportDescription": "Analysis based on retrieved document sections.",
        "keyMetrics": [{"label": "Documents Analyzed", "value": str(len(doc_names)), "status": "info"}],
        "summary": "Analysis completed using RAG-based document retrieval.",
    }


def _generate_report_html(answer: str, doc_names: list[str], report_context: dict, sources: list[dict]) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    title = report_context.get("reportTitle", "Document Analysis Report")
    entity = report_context.get("entityName", "Analysis Subject")
    desc = report_context.get("reportDescription", "Comprehensive document analysis")
    report_type = report_context.get("reportType", "General Analysis")
    summary = report_context.get("summary", "Analysis completed successfully.")
    metrics = report_context.get("keyMetrics", [])

    primary_color = "#2196f3"
    has_negative = any(m.get("status") == "negative" for m in metrics)
    has_positive = any(m.get("status") == "positive" for m in metrics)
    if has_negative:
        primary_color = "#ff8c00"
    elif has_positive:
        primary_color = "#4caf50"

    status_colors = {"positive": "#4caf50", "negative": "#ff8c00", "neutral": "#666", "info": "#2196f3"}

    metrics_html = ""
    if metrics:
        cards = ""
        for m in metrics:
            bg = status_colors.get(m.get("status", "info"), "#666")
            cards += f'<div class="risk-card" style="background: {bg};"><h3>{m.get("label", "")}</h3><div class="value">{m.get("value", "")}</div></div>'
        metrics_html = f'<div class="risk-summary">{cards}</div>'

    sources_html = ""
    if sources:
        rows = ""
        for s in sources:
            sim = s.get("similarity", 0)
            badge = "low" if sim > 0.7 else ("medium" if sim > 0.5 else "high")
            rows += f'<tr><td>{s.get("documentName", "")}</td><td>Chunk {s.get("chunkIndex", 0) + 1}</td><td><span class="badge badge-{badge}">{sim * 100:.1f}%</span></td><td>{s.get("preview", "")}</td></tr>'
        sources_html = f"""<div class="section"><h2>SOURCES USED</h2><table><thead><tr><th>Document</th><th>Section</th><th>Relevance</th><th>Preview</th></tr></thead><tbody>{rows}</tbody></table></div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - {entity}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }}
    .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }}
    .header {{ border-bottom: 4px solid {primary_color}; padding-bottom: 20px; margin-bottom: 30px; }}
    .header h1 {{ color: {primary_color}; font-size: 28px; margin-bottom: 10px; }}
    .header .subtitle {{ color: #666; font-size: 14px; line-height: 1.8; }}
    .alert-box {{ padding: 20px; margin: 20px 0; border-left: 5px solid; border-radius: 4px; }}
    .alert-medium {{ background: #e3f2fd; border-color: #2196f3; }}
    .section {{ margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }}
    .section h2 {{ color: #333; font-size: 20px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }}
    .section h3 {{ color: #555; font-size: 16px; margin: 15px 0 10px 0; }}
    .section p {{ margin: 10px 0; line-height: 1.8; }}
    .section ul {{ margin: 10px 0 10px 20px; line-height: 2; }}
    .section li {{ margin: 5px 0; }}
    table {{ width: 100%; border-collapse: collapse; background: white; font-size: 13px; margin: 15px 0; }}
    th {{ background: #333; color: white; padding: 12px; text-align: left; font-weight: 600; }}
    td {{ padding: 10px 12px; border-bottom: 1px solid #ddd; vertical-align: top; }}
    tr:hover {{ background: #f5f5f5; }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }}
    .badge-low {{ background: #4caf50; color: white; }}
    .badge-medium {{ background: #ffc107; color: black; }}
    .badge-high {{ background: #ff8c00; color: white; }}
    .risk-summary {{ display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap; }}
    .risk-card {{ flex: 1; min-width: 200px; padding: 20px; border-radius: 8px; text-align: center; color: white; }}
    .risk-card h3 {{ font-size: 14px; margin-bottom: 10px; opacity: 0.9; text-transform: uppercase; }}
    .risk-card .value {{ font-size: 32px; font-weight: bold; }}
    .footer {{ margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px; }}
    strong {{ font-weight: 600; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{title.upper()}</h1>
      <div class="subtitle">
        <strong>Subject:</strong> {entity}<br>
        <strong>Analysis Type:</strong> {report_type}<br>
        <strong>Report Date:</strong> {timestamp}<br>
        <strong>Documents Analyzed:</strong> {len(doc_names)}<br>
        <strong>Sources Retrieved:</strong> {len(sources)}
      </div>
    </div>
    <div class="alert-box alert-medium">
      <h2 style="color: {primary_color}; margin-bottom: 10px;">EXECUTIVE SUMMARY</h2>
      <p><strong>Description:</strong> {desc}</p>
      <p style="margin-top: 10px;"><strong>Key Findings:</strong> {summary}</p>
    </div>
    {metrics_html}
    <div class="section">
      <h2>DETAILED ANALYSIS</h2>
      {_format_analysis_content(answer)}
    </div>
    {sources_html}
    <div class="footer">
      <p><strong>CONFIDENTIAL REPORT</strong></p>
      <p>Generated by: RAG Document Analysis System</p>
      <p>Report ID: RPT-{int(time.time() * 1000)}</p>
    </div>
  </div>
</body>
</html>"""


@router.post("/ask-question")
async def ask_question(request: Request):
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        supabase = get_supabase_client()
        body = await request.json()

        question = body.get("question")
        document_ids = body.get("documentIds", [])
        custom_prompt = body.get("customPrompt")
        questions_template = body.get("questionsTemplate")
        generate_report = body.get("generateReport", False)
        rag_settings = body.get("ragSettings", {})
        request_rag_config = body.get("ragConfig", {})
        request_retrieval_config = body.get("retrievalConfig", {})
        request_output_format = body.get("outputFormat", {})
        conversation_history = body.get("conversationHistory", [])
        research_mode = body.get("researchMode", False)
        skill_type = body.get("skillType")
        skill_name = body.get("skillName")
        skill_output_format = body.get("skillOutputFormat")
        popia_config_raw = body.get("popiaConfig", {})
        model = body.get("model")

        # Provider-routing config for generation calls (Gemini or Claude).
        # Embeddings/retrieval keep using the Google key directly.
        llm = {
            "model": model or DEFAULT_MODEL,
            "google_api_key": api_key,
            "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),
        }

        if not question:
            raise ValueError("Question is required")
        if not research_mode and (not document_ids or len(document_ids) == 0):
            raise ValueError("Document IDs are required (or use research mode)")

        rag_config = {**DEFAULT_RAG_CONFIG, **(request_rag_config or {})}
        retrieval_config = {**DEFAULT_RETRIEVAL_CONFIG, **(request_retrieval_config or {})}
        output_format = {**DEFAULT_OUTPUT_FORMAT, **(request_output_format or {})}
        popia = {**DEFAULT_POPIA_CONFIG, **(popia_config_raw or {})}

        compliance_info = {
            "piiDetected": False,
            "redactionApplied": False,
            "riskLevel": "none",
            "detectedTypes": [],
        }

        top_k = request_rag_config.get("top_k") or rag_settings.get("topK") or rag_config["top_k"]
        threshold = request_rag_config.get("similarity_threshold") or rag_settings.get("threshold") or rag_config["similarity_threshold"]

        print(f"Asking question about {len(document_ids)} document(s): {question}")
        print(f"Research mode: {'YES' if research_mode else 'NO'}")

        skills_applied: list[str] = []
        start_time = time.time()

        # =====================================================
        # RESEARCH MODE
        # =====================================================
        if research_mode:
            print("Research Mode: Bypassing RAG, querying general knowledge")
            skills_applied.append("Research Mode")

            research_prompt = custom_prompt or """You are a Research Assistant specializing in statistical methods, machine learning, and quantitative analysis.

Your role is to help the user explore and understand:
- Statistical methodologies (regression, time series, classification, etc.)
- Machine learning techniques and their applications
- Model validation and performance metrics
- Industry best practices and standards
- Alternative approaches and challenger models

IMPORTANT GUIDELINES:
1. Provide objective, educational responses about methodologies and techniques
2. When discussing alternatives, explain pros/cons and when each approach is appropriate
3. Reference academic literature and industry standards where relevant
4. Focus on helping the user understand concepts they can apply to their own work
5. If the user describes a methodology, suggest potential challenger approaches or improvements"""

            if conversation_history:
                research_prompt += "\n\n## CONVERSATION HISTORY:\n"
                for msg in conversation_history:
                    if msg.get("role") == "user":
                        research_prompt += f"USER: {msg['content']}\n\n"
                    elif msg.get("role") == "assistant":
                        content = msg["content"]
                        if len(content) > 2000:
                            content = content[:2000] + "... [truncated]"
                        research_prompt += f"ASSISTANT: {content}\n\n"
                research_prompt += f"---\n\n## CURRENT QUESTION:\n{question}"
            else:
                research_prompt += f"\n\n## USER QUESTION:\n{question}"

            answer = await call_llm(research_prompt, llm, temperature=0.5, max_output_tokens=8192)
            processing_ms = int((time.time() - start_time) * 1000)

            return {
                "answer": answer or "No answer generated",
                "sources": [],
                "skillsApplied": skills_applied,
                "processingTimeMs": processing_ms,
                "researchMode": True,
            }

        # =====================================================
        # META SKILL HANDLING
        # =====================================================
        if skill_type == "meta" and skill_name == "Skill Creator":
            print("Meta Skill: Skill Creator")
            skills_applied.append("Skill Creator (Meta)")

            meta_prompt = f"""You are the Skill Creator. Generate a complete skill definition in JSON format.

The user wants to create a skill for: {question}

{"Additional context from the selected skill prompt:\\n" + custom_prompt + "\\n" if custom_prompt else ""}

Generate a JSON response with:
{{
  "skill": {{
    "name": "Short name",
    "description": "2-3 sentences",
    "category": "Best category",
    "icon": "Emoji",
    "skill_type": "expert",
    "output_format": "text",
    "prompt_content": "Full expert framework"
  }},
  "reasoning": "Why you made these choices",
  "suggested_use_cases": ["Use case 1", "Use case 2"]
}}"""

            raw_answer = await call_llm(meta_prompt, llm, temperature=0.7, max_output_tokens=4096, timeout=60.0)
            processing_ms = int((time.time() - start_time) * 1000)

            generated_skill = extract_json(raw_answer) if raw_answer else None

            return {
                "answer": raw_answer or "",
                "sources": [],
                "skillsApplied": skills_applied,
                "processingTimeMs": processing_ms,
                "skillType": "meta",
                "generatedSkill": generated_skill,
            }

        # =====================================================
        # STANDARD RAG FLOW
        # =====================================================

        # Get document names
        docs_resp = supabase.table("documents").select("id, name").in_("id", document_ids).execute()
        documents = docs_resp.data or []
        document_map = {d["id"]: d["name"] for d in documents}
        document_names = [d["name"] for d in documents]
        document_list = "\n".join(f"{i + 1}. {d['name']}" for i, d in enumerate(documents))

        # =====================================================
        # FULL DOCUMENT MODE
        # =====================================================
        full_doc_mode = retrieval_config.get("enable_full_document_mode", False)
        full_doc_max = retrieval_config.get("full_document_max_chars", 100000)
        use_full_doc = False
        full_doc_context = ""
        full_doc_sources: list[dict] = []

        if full_doc_mode:
            print(f"Full Document Mode enabled (max {full_doc_max} chars)")

            text_resp = (
                supabase.table("documents")
                .select("id, name, original_extracted_text, total_characters")
                .in_("id", document_ids)
                .execute()
            )
            docs_with_text = text_resp.data or []

            total_chars = 0
            doc_texts: list[dict] = []
            for doc in docs_with_text:
                if doc.get("original_extracted_text"):
                    total_chars += len(doc["original_extracted_text"])
                    doc_texts.append({"name": doc["name"], "text": doc["original_extracted_text"]})

            if total_chars <= full_doc_max and doc_texts:
                use_full_doc = True
                skills_applied.append("Full Document Mode")

                sep = "\n\n" + "=" * 80 + "\n\n"
                full_doc_context = sep.join(
                    f"[DOCUMENT {i + 1}: {dt['name']}]\n\n{dt['text']}" for i, dt in enumerate(doc_texts)
                )
                full_doc_sources = [
                    {
                        "documentName": dt["name"],
                        "chunkIndex": 0,
                        "similarity": 1.0,
                        "preview": dt["text"][:500] + ("..." if len(dt["text"]) > 500 else ""),
                    }
                    for dt in doc_texts
                ]

        context_text = ""
        sources: list[dict] = []

        # =====================================================
        # RAG SKILLS PIPELINE — PRE-RETRIEVAL
        # =====================================================
        processed_question = question
        was_decomposed = False
        sub_questions: list[str] = []
        chunks: list[dict] = []

        if not use_full_doc:
            # 1. Query Rewriting
            if rag_config.get("enable_query_rewrite"):
                rewritten = await rewrite_query(question, ", ".join(document_names), api_key)
                if rewritten != question:
                    processed_question = rewritten
                    skills_applied.append("Query Rewrite")

            # 2. Query Decomposition
            if rag_config.get("enable_decomposition"):
                sub_questions = await decompose_question(processed_question, api_key)
                if len(sub_questions) > 1:
                    was_decomposed = True
                    skills_applied.append("Decomposition")
                else:
                    sub_questions = [processed_question]
            else:
                sub_questions = [processed_question]

            # 3. HyDE
            hyde_context = ""
            if rag_config.get("enable_hyde") and len(sub_questions) == 1:
                hyde_context = await generate_hypothetical_answer(processed_question, document_names, api_key)
                if hyde_context:
                    skills_applied.append("HyDE")

            # Generate query embedding
            embedding_query = f"{processed_question}\n\nContext: {hyde_context}" if hyde_context else processed_question
            query_embedding = await generate_query_embedding(embedding_query, api_key)

            # Helper for retrieval
            async def perform_retrieval(q: str) -> list[dict]:
                q_embed = await generate_query_embedding(q, api_key)
                resp = supabase.rpc("match_document_chunks", {
                    "query_embedding": f"[{','.join(str(v) for v in q_embed)}]",
                    "match_threshold": threshold,
                    "match_count": top_k * 2 if retrieval_config.get("enable_fusion") else top_k,
                    "filter_document_ids": document_ids,
                }).execute()
                return [
                    {
                        "id": c.get("id", ""),
                        "document_id": c["document_id"],
                        "document_name": c["document_name"],
                        "chunk_index": c["chunk_index"],
                        "content": c["content"],
                        "similarity": c["similarity"],
                    }
                    for c in (resp.data or [])
                ]

            # Vector similarity search
            retrieval_top_k = top_k * 2 if retrieval_config.get("enable_fusion") else top_k
            search_resp = supabase.rpc("match_document_chunks", {
                "query_embedding": f"[{','.join(str(v) for v in query_embedding)}]",
                "match_threshold": threshold,
                "match_count": retrieval_top_k,
                "filter_document_ids": document_ids,
            }).execute()

            chunks = [
                {
                    "id": c.get("id", ""),
                    "document_id": c["document_id"],
                    "document_name": c["document_name"],
                    "chunk_index": c["chunk_index"],
                    "content": c["content"],
                    "similarity": c["similarity"],
                }
                for c in (search_resp.data or [])
            ]

            # 1. Fusion Retrieval
            if retrieval_config.get("enable_fusion") and chunks:
                kw_results = keyword_search(processed_question, chunks, top_k)
                if retrieval_config.get("fusion_strategy") == "rrf":
                    chunks = fusion_rrf(chunks, kw_results)
                else:
                    chunks = fusion_weighted(chunks, kw_results, retrieval_config.get("fusion_weights", {"semantic": 0.7, "keyword": 0.3}))
                skills_applied.append("Fusion Retrieval")

            # 2. Hierarchical Expansion
            if retrieval_config.get("enable_hierarchical") and retrieval_config.get("expand_to_parent") and chunks:
                chunks = await expand_to_parent_chunks(chunks, retrieval_config.get("max_hierarchy_depth", 1), supabase)
                skills_applied.append("Hierarchical Expansion")

            # 3. CRAG
            if retrieval_config.get("enable_crag") and chunks:
                crag_result = await corrective_rag(
                    processed_question, chunks, retrieval_config.get("crag_relevance_threshold", 0.4),
                    api_key, perform_retrieval,
                )
                if crag_result["corrected"]:
                    chunks = crag_result["chunks"]
                    skills_applied.append("CRAG")

            # 4. Self-RAG
            if retrieval_config.get("enable_self_rag") and chunks:
                self_rag_result = await self_rag(
                    processed_question, chunks, retrieval_config.get("self_rag_threshold", 0.6),
                    retrieval_config.get("max_self_rag_iterations", 2), api_key, perform_retrieval,
                )
                if self_rag_result["refined"]:
                    chunks = self_rag_result["chunks"]
                    skills_applied.append("Self-RAG")

            # 5. Reranking
            if retrieval_config.get("enable_reranking") and retrieval_config.get("reranker_model") != "none" and chunks:
                chunks = await rerank_chunks(processed_question, chunks, retrieval_config.get("rerank_top_n", 10), api_key)
                skills_applied.append("Reranking")

            chunks = chunks[:top_k]

        # Build context
        if use_full_doc:
            context_text = full_doc_context
            sources = full_doc_sources
        elif chunks:
            parts = []
            for chunk in chunks:
                relevance = chunk.get("final_score") or chunk.get("rerank_score") or chunk.get("similarity", 0)
                sources.append({
                    "documentName": chunk["document_name"],
                    "chunkIndex": chunk["chunk_index"],
                    "similarity": relevance,
                    "preview": chunk["content"][:200] + ("..." if len(chunk["content"]) > 200 else ""),
                })
                is_parent = " [Parent Context]" if chunk.get("is_parent") else ""
                parts.append(f"[Source: {chunk['document_name']}, Chunk {chunk['chunk_index'] + 1}{is_parent}, Relevance: {relevance * 100:.1f}%]\n{chunk['content']}")
            context_text = "\n\n---\n\n".join(parts)
        else:
            context_text = "No relevant content was found in the uploaded documents for this query."

        # =====================================================
        # POPIA COMPLIANCE
        # =====================================================
        if popia.get("enablePIIDetection") and context_text:
            pii_result = detect_pii(context_text)
            compliance_info["piiDetected"] = pii_result["hasPII"]
            compliance_info["riskLevel"] = pii_result["riskLevel"]
            compliance_info["detectedTypes"] = pii_result["detectedTypes"]

            if pii_result["hasPII"] and popia.get("enableAutoRedaction"):
                context_text = redact_pii(context_text, {
                    "redactEmails": popia.get("redactEmails", True),
                    "redactPhones": popia.get("redactPhones", True),
                    "redactIDNumbers": popia.get("redactIDNumbers", True),
                    "redactCreditCards": popia.get("redactCreditCards", True),
                })
                compliance_info["redactionApplied"] = True
                skills_applied.append("POPIA Redaction")

            if popia.get("logAPIRequests"):
                audit = create_audit_entry(
                    "RAG_QUERY", "document_chunks", pii_result,
                    compliance_info["redactionApplied"], len(context_text),
                    "Google Gemini API", "Document Q&A Analysis",
                )
                compliance_info["auditLog"] = json.dumps(audit)

        # =====================================================
        # BUILD PROMPT
        # =====================================================
        reasoning_addition = ""
        if rag_config.get("enable_reasoning") and is_complex_question(processed_question):
            reasoning_addition = REASONING_PROMPT
            skills_applied.append("Multi-Step Reasoning")

        if use_full_doc:
            docs_instruction = f"""\n\n## COMPLETE DOCUMENT CONTENT:
You have been provided with the COMPLETE TEXT of {len(document_ids)} document(s).

**DOCUMENTS PROVIDED:**
{document_list}

**FULL DOCUMENT TEXT:**
{context_text}

**CRITICAL REQUIREMENTS:**
1. Base your response ONLY on the document content above
2. CITE specific documents using the format: [Source: Document Name]
3. Quote exact text from the documents where relevant
4. If the documents don't contain enough information, state so clearly
5. DO NOT use general knowledge
6. DO NOT hallucinate or fabricate information
7. You have access to the COMPLETE document - provide thorough analysis

"""
        else:
            docs_instruction = f"""\n\n## RETRIEVED DOCUMENT CONTEXT:
You have been provided with {len(chunks)} relevant section(s) from {len(document_ids)} document(s).

**DOCUMENTS AVAILABLE:**
{document_list}

**RETRIEVED SECTIONS:**
{context_text}

**CRITICAL REQUIREMENTS:**
1. Base your response ONLY on the retrieved sections above
2. CITE specific sources using the format: [Source: Document Name, Chunk X]
3. Quote exact text from the retrieved sections where relevant
4. If sections don't contain enough information, state: "The retrieved document sections do not contain complete information for this query"
5. DO NOT use general knowledge
6. DO NOT hallucinate or fabricate information

"""

        output_instructions = _build_output_format_instructions(output_format)

        default_prompt = """You are a domain specialist assistant.

You help the user draft formal, defensible written responses to structured questionnaires and requests for information.

You have access to retrieved sections from organisation-specific documents including:
- Technical frameworks, methodologies, policies, procedures and governance documents
- Supporting quantitative analyses (models, tables, figures, parameter summaries)
- Historical versions of documents

# GENERAL PRINCIPLES

1. Answer each question directly and completely based on the retrieved sections.
   - Restate the question ID and title in your response
   - If the question has bullet points or sub-clauses, respond to each explicitly

2. Base your response on the retrieved document sections.
   - Use ONLY the information from the retrieved sections
   - Reference the source document and chunk number

3. Use citations to supporting documentation.
   - Format: [Source: <Document Name>, Chunk <X>]
   - Only cite content that appears in the retrieved sections

4. Structure and tone.
   - Use a formal, professional tone
   - Recommended structure:
     1. "Response to Question <ID>: <Title>"
     2. Short summary paragraph
     3. Detailed response with sub-headings
     4. Key citations
   - Provide comprehensive, thorough responses with detail from the documents

5. Handling missing information.
   - If specific detail is not in the retrieved sections, state: "This information was not found in the retrieved document sections"
   - Suggest what type of information might be needed

6. No fabrication.
   - Do not invent values, policies, or technical details
   - If you cannot answer from the retrieved sections, say so clearly"""

        final_prompt = ""

        if questions_template and isinstance(questions_template, list) and len(questions_template) > 0:
            final_prompt = default_prompt
            if custom_prompt:
                final_prompt += f"\n\n## EXPERT KNOWLEDGE / ASSESSMENT FRAMEWORK:\n{custom_prompt}\n\n"
            final_prompt += docs_instruction
            final_prompt += f"## USER QUESTION/INSTRUCTION:\n{question}\n\n## QUESTIONS TO ANSWER:\n\n"

            for idx, q in enumerate(questions_template):
                q_text = q if isinstance(q, str) else (q.get("question") or q.get("text") or json.dumps(q))
                q_id = str(idx + 1) if isinstance(q, str) else (q.get("question_id") or str(idx + 1))
                final_prompt += f"Question {idx + 1} [{q_id}]: {q_text}\n\n"

            final_prompt += f"""\n{output_instructions}\n\n## RESPONSE INSTRUCTIONS:
For EACH question above:
1. Search the retrieved sections for relevant information
2. Provide a COMPLETE, DETAILED response using ONLY information from the retrieved sections
3. Structure your answer according to the OUTPUT FORMAT specified above
4. CITE specific sources using the CITATION FORMAT specified above
5. If information is not in the retrieved sections, state so clearly

**CRITICAL:** Answer ALL questions. Follow the output format. Cite your sources. Never fabricate information."""

        else:
            final_prompt = default_prompt
            if custom_prompt:
                final_prompt += f"\n\n## EXPERT KNOWLEDGE / ASSESSMENT FRAMEWORK:\n{custom_prompt}\n\n"
            final_prompt += docs_instruction
            final_prompt += f"{output_instructions}\n\n"

            if conversation_history:
                final_prompt += "## CONVERSATION HISTORY (for context):\n"
                final_prompt += "The user is continuing a conversation. Here is the previous exchange for context:\n\n"
                for msg in conversation_history:
                    if msg.get("role") == "user":
                        final_prompt += f"USER: {msg['content']}\n\n"
                    elif msg.get("role") == "assistant":
                        content = msg["content"]
                        if len(content) > 2000:
                            content = content[:2000] + "... [truncated for brevity]"
                        final_prompt += f"ASSISTANT: {content}\n\n"
                final_prompt += f"""---\n\n## CURRENT FOLLOW-UP QUESTION:\n{question}\n\nINSTRUCTIONS:
- This is a FOLLOW-UP question in an ongoing conversation
- Build upon and reference the previous responses where relevant
- Provide ADDITIONAL information that complements what was already discussed
- If the user is asking for clarification, provide more detail on that specific topic
- Use ONLY the information from the retrieved sections
- CITE your sources using the CITATION FORMAT specified above
- Do NOT repeat information already provided unless specifically asked"""
            else:
                final_prompt += f"""## USER QUESTION:\n{question}\n\nINSTRUCTIONS:
- Use ONLY the information from the retrieved sections
- Provide a COMPLETE, DETAILED answer following the OUTPUT FORMAT above
- Structure your response according to the STRUCTURE REQUIREMENTS
- CITE your sources using the CITATION FORMAT specified above
- If information is not in the retrieved sections, state so clearly"""

        if generate_report:
            final_prompt += """\n\n## REPORT GENERATION:
Generate a structured report with:
- Executive Summary with critical findings
- Risk Assessment with indicators
- Detailed findings with structured sections
- Recommendations
- Use professional styling"""

        if reasoning_addition:
            final_prompt += f"\n\n## REASONING FRAMEWORK:{reasoning_addition}"

        print(f"=== SENDING TO {llm['model']} ===")
        print(f"Prompt length: {len(final_prompt)} characters")

        answer = await call_llm(final_prompt, llm, temperature=0.3, max_output_tokens=8192)

        if not answer:
            answer = "No answer generated"

        # =====================================================
        # POST-RETRIEVAL SKILLS
        # =====================================================
        verification = None
        if rag_config.get("enable_verification") and answer != "No answer generated":
            verification = await verify_answer(processed_question, answer, document_names, api_key)
            skills_applied.append("Verification")

        confidence = None
        if rag_config.get("enable_confidence") and answer != "No answer generated":
            confidence = await assess_confidence(processed_question, answer, document_names, len(sources), api_key)
            skills_applied.append("Confidence")

        processing_ms = int((time.time() - start_time) * 1000)

        # Generate report if requested
        report_html = None
        report_data = None

        if generate_report and answer:
            doc_names = [d["name"] for d in documents]
            report_context = await _generate_report_context(answer, question, doc_names, custom_prompt, llm)
            report_html = _generate_report_html(answer, doc_names, report_context, sources)
            report_data = {"answer": answer, "documents": doc_names, "reportContext": report_context, "sources": sources}

        result = {
            "answer": answer,
            "reportHtml": report_html,
            "reportData": report_data,
            "sources": sources,
            "originalQuestion": question,
            "processedQuestion": processed_question if processed_question != question else None,
            "wasDecomposed": was_decomposed,
            "subQuestions": sub_questions if was_decomposed else None,
            "verification": verification,
            "confidence": confidence,
            "skillsApplied": skills_applied,
            "processingTimeMs": processing_ms,
            "skillType": skill_type or "expert",
            "skillOutputFormat": skill_output_format or "text",
            "isGeneratorSkill": skill_type == "generator",
        }

        if popia.get("showComplianceIndicators"):
            result["complianceInfo"] = compliance_info

        return result

    except Exception as e:
        print(f"Ask question error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
