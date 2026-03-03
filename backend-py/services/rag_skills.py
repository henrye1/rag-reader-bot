"""RAG Skills Implementation Module.

Each skill is a standalone async function that can be enabled/disabled.
Includes pre-retrieval, post-retrieval, and retrieval enhancement skills.
"""

import re
import math
from typing import Callable, Awaitable
from services.gemini_client import generate_content, extract_json

# =====================================================
# CONFIG DEFAULTS
# =====================================================

DEFAULT_RAG_CONFIG = {
    "enable_hyde": False,
    "enable_query_rewrite": False,
    "enable_decomposition": False,
    "enable_verification": False,
    "enable_confidence": False,
    "enable_reasoning": False,
    "top_k": 15,
    "similarity_threshold": 0.3,
}

DEFAULT_RETRIEVAL_CONFIG = {
    "enable_full_document_mode": False,
    "full_document_max_chars": 100000,
    "enable_reranking": False,
    "reranker_model": "none",
    "rerank_top_n": 10,
    "enable_fusion": False,
    "fusion_strategy": "rrf",
    "fusion_weights": {"semantic": 0.7, "keyword": 0.3},
    "enable_hierarchical": False,
    "expand_to_parent": True,
    "max_hierarchy_depth": 1,
    "enable_self_rag": False,
    "max_self_rag_iterations": 2,
    "self_rag_threshold": 0.6,
    "enable_crag": False,
    "crag_relevance_threshold": 0.4,
    "enable_web_fallback": False,
    "enable_feedback_loop": False,
    "feedback_learning_rate": 0.1,
}

REASONING_PROMPT = """
When answering this complex analytical question, use this reasoning framework:

STEP 1 - UNDERSTAND: Identify what the question is really asking
STEP 2 - LOCATE: Find relevant sections in the documents
STEP 3 - EXTRACT: Pull specific facts, figures, and quotes
STEP 4 - ANALYZE: Apply domain expertise to interpret findings
STEP 5 - SYNTHESIZE: Combine insights into a coherent answer
STEP 6 - CITE: Add proper citations for all claims

Structure your response as:
<reasoning>
Brief notes on your analysis process
</reasoning>

<answer>
Your final, well-cited answer
</answer>
"""


# =====================================================
# PRE-RETRIEVAL SKILLS
# =====================================================

async def generate_hypothetical_answer(
    question: str,
    document_names: list[str],
    api_key: str,
    temperature: float = 0.5,
    max_tokens: int = 500,
) -> str:
    """HyDE: Hypothetical Document Embeddings."""
    prompt = f"""You are analyzing documents: {', '.join(document_names)}.

Without access to the actual content, write what a comprehensive answer to this question WOULD look like:

Question: {question}

Write a detailed hypothetical answer (2-3 paragraphs) that would be expected from these types of documents.
This will help guide the actual document analysis.

Hypothetical Answer:"""

    try:
        return await generate_content(prompt, temperature=temperature, max_output_tokens=max_tokens, api_key=api_key)
    except Exception as e:
        print(f"HyDE error: {e}")
        return ""


async def rewrite_query(question: str, document_context: str, api_key: str) -> str:
    """Query Rewriting — improves vague or poorly-formed questions."""
    prompt = f"""You are a query optimizer. Improve this question to be more specific and searchable.

Original Question: "{question}"

Document Context: The user has uploaded documents related to: {document_context}

Rules:
1. Make the question more specific
2. Add relevant domain terminology if appropriate
3. If already clear, return the original
4. Keep the original intent
5. Do not add information not implied by the original question

Improved Question (return ONLY the improved question, nothing else):"""

    try:
        result = await generate_content(prompt, temperature=0.2, max_output_tokens=200, api_key=api_key)
        improved = result.strip()
        if improved:
            print(f'Query Rewrite: "{question}" -> "{improved}"')
            return improved
        return question
    except Exception as e:
        print(f"Query rewrite error: {e}")
        return question


async def decompose_question(question: str, api_key: str, max_subquestions: int = 5) -> list[str]:
    """Query Decomposition — breaks complex questions into simpler sub-questions."""
    prompt = f"""Analyze this question and determine if it should be broken into sub-questions.

Question: "{question}"

If the question is simple (single topic, single aspect), return:
{{"decompose": false, "questions": ["{question}"]}}

If the question is complex (multiple topics, comparisons, or multi-part), break it down into at most {max_subquestions} sub-questions:
{{"decompose": true, "questions": ["sub-question 1", "sub-question 2", ...]}}

Important: Each sub-question should be self-contained and answerable independently.

Return ONLY valid JSON, no other text:"""

    try:
        result = await generate_content(prompt, temperature=0, max_output_tokens=500, api_key=api_key)
        parsed = extract_json(result)

        if parsed and isinstance(parsed, dict):
            if parsed.get("decompose") and isinstance(parsed.get("questions"), list) and len(parsed["questions"]) > 1:
                print(f"Query decomposed into {len(parsed['questions'])} sub-questions")
                return parsed["questions"]
        return [question]
    except Exception as e:
        print(f"Query decomposition error: {e}")
        return [question]


# =====================================================
# POST-RETRIEVAL SKILLS
# =====================================================

async def verify_answer(question: str, answer: str, document_names: list[str], api_key: str) -> dict:
    """Answer Verification — checks for hallucinations and unsupported claims."""
    prompt = f"""You are a fact-checker. Verify this answer against strict criteria.

QUESTION: {question}

ANSWER TO VERIFY:
{answer}

AVAILABLE DOCUMENTS: {', '.join(document_names)}

CHECK FOR:
1. Does the answer cite documents that are NOT in the available list? (CRITICAL - this is hallucination)
2. Does the answer make specific claims without any citation? (MINOR if general, MAJOR if specific)
3. Does the answer contain obvious logical inconsistencies?
4. Does the answer contain information clearly not from the documents?

Return JSON only:
{{
  "verified": true/false,
  "issues": ["issue 1", "issue 2"],
  "severity": "none" | "minor" | "major",
  "suggestion": "How to improve if issues found"
}}"""

    try:
        result = await generate_content(prompt, temperature=0, max_output_tokens=500, api_key=api_key)
        parsed = extract_json(result)

        if parsed and isinstance(parsed, dict):
            print(f"Verification: verified={parsed.get('verified')}, severity={parsed.get('severity')}")
            return {
                "verified": parsed.get("verified", True),
                "issues": parsed.get("issues", []),
                "severity": parsed.get("severity", "none"),
                "suggestion": parsed.get("suggestion"),
            }
        return {"verified": True, "issues": [], "severity": "none"}
    except Exception as e:
        print(f"Answer verification error: {e}")
        return {"verified": True, "issues": [], "severity": "none"}


async def assess_confidence(
    question: str,
    answer: str,
    document_names: list[str],
    sources_count: int,
    api_key: str,
) -> dict:
    """Confidence Scoring — assesses answer confidence based on document coverage."""
    prompt = f"""Assess the confidence level of this answer.

Question: {question}

Answer: {answer}

Documents used: {', '.join(document_names)}
Number of source chunks retrieved: {sources_count}

Rate confidence from 0.0 to 1.0 based on:
- How well the answer addresses the question
- Strength of citations/evidence in the answer
- Number and quality of sources used
- Any apparent gaps or assumptions

Return JSON only:
{{
  "score": 0.0-1.0,
  "reasoning": "Brief explanation of score",
  "gaps": ["Any information gaps identified"]
}}"""

    try:
        result = await generate_content(prompt, temperature=0, max_output_tokens=300, api_key=api_key)
        parsed = extract_json(result)

        if parsed and isinstance(parsed, dict):
            score = min(1.0, max(0.0, parsed.get("score", 0.5)))
            label = "High" if score >= 0.7 else ("Medium" if score >= 0.4 else "Low")
            print(f"Confidence: {score} ({label})")
            return {
                "score": score,
                "label": label,
                "reasoning": parsed.get("reasoning", ""),
                "gaps": parsed.get("gaps", []),
            }
        return {"score": 0.5, "label": "Medium", "reasoning": "Unable to assess", "gaps": []}
    except Exception as e:
        print(f"Confidence assessment error: {e}")
        return {"score": 0.5, "label": "Medium", "reasoning": "Unable to assess", "gaps": []}


def is_complex_question(question: str) -> bool:
    """Detect if a question is complex (for multi-step reasoning)."""
    indicators = [
        "compare", "contrast", "analyze", "evaluate", "assess",
        "implications", "relationship between", "how does", "why does",
        "impact", "risk", "compliance", "recommend", "difference",
        "pros and cons", "advantages", "disadvantages", "trade-off",
        "multiple", "several", "various", "different aspects",
        "step by step", "process", "methodology", "framework",
    ]
    lower = question.lower()
    return any(ind in lower for ind in indicators)


# =====================================================
# RETRIEVAL ENHANCEMENT SKILLS
# =====================================================

async def rerank_chunks(query: str, chunks: list[dict], top_n: int, api_key: str) -> list[dict]:
    """LLM-based Reranking — uses Gemini to rerank retrieved chunks."""
    if not chunks:
        return []
    if len(chunks) <= top_n:
        return chunks

    chunk_list = [
        {"id": i, "preview": c["content"][:500], "doc": c["document_name"]}
        for i, c in enumerate(chunks[:30])
    ]

    prompt = f"""You are a relevance ranker. Given a query and document chunks, rank the chunks by relevance.

QUERY: "{query}"

CHUNKS:
{chr(10).join(f'[{c["id"]}] ({c["doc"]}): {c["preview"]}...' for c in chunk_list)}

Return a JSON array of chunk IDs in order of relevance (most relevant first):
{{"ranking": [id1, id2, id3, ...]}}

Only return the top {top_n} most relevant chunks. Return ONLY valid JSON."""

    try:
        result = await generate_content(prompt, temperature=0, max_output_tokens=500, api_key=api_key)
        parsed = extract_json(result)

        if parsed and isinstance(parsed, dict) and isinstance(parsed.get("ranking"), list):
            reranked: list[dict] = []
            for idx in parsed["ranking"][:top_n]:
                if isinstance(idx, int) and 0 <= idx < len(chunks):
                    chunk = {**chunks[idx]}
                    chunk["rerank_score"] = 1 - (len(reranked) / top_n)
                    chunk["final_score"] = chunk["rerank_score"]
                    reranked.append(chunk)
            if reranked:
                print(f"Reranked {len(chunks)} chunks to top {len(reranked)}")
                return reranked
    except Exception as e:
        print(f"Reranking error: {e}")

    return chunks[:top_n]


def keyword_search(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    """BM25-like keyword scoring for fusion retrieval."""
    query_terms = [t for t in query.lower().split() if len(t) > 2]

    scored = []
    for chunk in chunks:
        content = chunk["content"].lower()
        score = 0.0

        for term in query_terms:
            count = len(re.findall(re.escape(term), content, re.IGNORECASE))
            if count > 0:
                doc_length = len(content)
                avg_doc_length = 1500
                k1 = 1.5
                b = 0.75
                tf = (count * (k1 + 1)) / (count + k1 * (1 - b + b * (doc_length / avg_doc_length)))
                score += tf

        scored.append({**chunk, "keyword_score": score})

    scored.sort(key=lambda c: c.get("keyword_score", 0), reverse=True)
    return scored[:top_k]


def fusion_rrf(semantic_results: list[dict], keyword_results: list[dict], k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion — combines semantic and keyword search results."""
    scores: dict[str, dict] = {}

    for rank, chunk in enumerate(semantic_results):
        key = f"{chunk['document_id']}-{chunk['chunk_index']}"
        rrf_score = 1 / (k + rank + 1)
        scores[key] = {"chunk": chunk, "score": rrf_score}

    for rank, chunk in enumerate(keyword_results):
        key = f"{chunk['document_id']}-{chunk['chunk_index']}"
        rrf_score = 1 / (k + rank + 1)
        existing = scores.get(key)
        if existing:
            existing["score"] += rrf_score
            existing["chunk"]["keyword_score"] = chunk.get("keyword_score")
        else:
            scores[key] = {"chunk": {**chunk}, "score": rrf_score}

    fused = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    result = [{**item["chunk"], "final_score": item["score"]} for item in fused]

    print(f"Fusion RRF: Combined {len(semantic_results)} semantic + {len(keyword_results)} keyword results")
    return result


def fusion_weighted(
    semantic_results: list[dict],
    keyword_results: list[dict],
    weights: dict,
) -> list[dict]:
    """Weighted Fusion — combines results using explicit weights."""
    scores: dict[str, dict] = {}

    for chunk in semantic_results:
        key = f"{chunk['document_id']}-{chunk['chunk_index']}"
        weighted = chunk["similarity"] * weights.get("semantic", 0.7)
        scores[key] = {"chunk": chunk, "score": weighted}

    max_keyword = max((c.get("keyword_score", 0) for c in keyword_results), default=1) or 1
    for chunk in keyword_results:
        key = f"{chunk['document_id']}-{chunk['chunk_index']}"
        norm_kw = (chunk.get("keyword_score", 0) / max_keyword)
        weighted = norm_kw * weights.get("keyword", 0.3)

        existing = scores.get(key)
        if existing:
            existing["score"] += weighted
            existing["chunk"]["keyword_score"] = chunk.get("keyword_score")
        else:
            scores[key] = {"chunk": {**chunk}, "score": weighted}

    fused = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    return [{**item["chunk"], "final_score": item["score"]} for item in fused]


async def assess_retrieval_quality(query: str, chunks: list[dict], api_key: str) -> dict:
    """Assess how well retrieved chunks can answer the query (used by Self-RAG and CRAG)."""
    if not chunks:
        return {"score": 0, "gaps": ["No chunks retrieved"], "isRelevant": False}

    previews = "\n\n".join(
        f"[{i + 1}] {c['content'][:300]}..." for i, c in enumerate(chunks[:5])
    )

    prompt = f"""Assess how well these retrieved document chunks can answer the query.

QUERY: "{query}"

RETRIEVED CHUNKS:
{previews}

Evaluate:
1. Do the chunks contain information directly relevant to the query?
2. Is there enough information to fully answer the query?
3. What information gaps exist?

Return JSON:
{{
  "score": 0.0-1.0,
  "isRelevant": true/false,
  "gaps": ["gap 1", "gap 2"]
}}"""

    try:
        result = await generate_content(prompt, temperature=0, max_output_tokens=300, api_key=api_key)
        parsed = extract_json(result)

        if parsed and isinstance(parsed, dict):
            return {
                "score": min(1.0, max(0.0, parsed.get("score", 0.5))),
                "gaps": parsed.get("gaps", []),
                "isRelevant": parsed.get("isRelevant", True),
            }
    except Exception as e:
        print(f"Quality assessment error: {e}")

    return {"score": 0.5, "gaps": [], "isRelevant": True}


async def _refine_query_for_gaps(original_query: str, gaps: list[str], api_key: str) -> str:
    if not gaps:
        return original_query

    prompt = f"""Given the original query and identified information gaps, generate a refined query.

ORIGINAL QUERY: "{original_query}"

INFORMATION GAPS:
{chr(10).join(f'{i + 1}. {g}' for i, g in enumerate(gaps))}

Generate a refined query that would better retrieve the missing information.
Return ONLY the refined query, nothing else."""

    try:
        result = await generate_content(prompt, temperature=0.3, max_output_tokens=200, api_key=api_key)
        refined = result.strip()
        if refined:
            return refined
    except Exception as e:
        print(f"Query refinement error: {e}")

    return original_query


async def self_rag(
    query: str,
    initial_chunks: list[dict],
    threshold: float,
    max_iterations: int,
    api_key: str,
    retrieve_fn: Callable[[str], Awaitable[list[dict]]],
) -> dict:
    """Self-RAG: Self-Reflective Retrieval — iteratively improves retrieval."""
    current_chunks = list(initial_chunks)
    iterations = 0
    refined = False

    for i in range(max_iterations):
        assessment = await assess_retrieval_quality(query, current_chunks, api_key)

        if assessment["score"] >= threshold:
            print(f"Self-RAG: Quality sufficient ({assessment['score']:.2f}) after {iterations} iterations")
            break

        iterations += 1
        refined = True

        refined_query = await _refine_query_for_gaps(query, assessment["gaps"], api_key)

        if refined_query != query:
            print(f'Self-RAG iteration {iterations}: Refining query to: "{refined_query}"')
            new_chunks = await retrieve_fn(refined_query)

            seen = {f"{c['document_id']}-{c['chunk_index']}" for c in current_chunks}
            for chunk in new_chunks:
                key = f"{chunk['document_id']}-{chunk['chunk_index']}"
                if key not in seen:
                    current_chunks.append(chunk)
                    seen.add(key)

    return {"chunks": current_chunks, "iterations": iterations, "refined": refined}


async def _transform_query_for_crag(query: str, api_key: str) -> str:
    prompt = f"""The following query did not retrieve good results. Transform it to be more effective.

ORIGINAL QUERY: "{query}"

Strategies to try:
1. Break into simpler sub-questions
2. Use different terminology
3. Make more specific or more general
4. Add context clues

Return ONLY the transformed query, nothing else."""

    try:
        result = await generate_content(prompt, temperature=0.4, max_output_tokens=200, api_key=api_key)
        transformed = result.strip()
        if transformed:
            print(f'CRAG query transform: "{query}" -> "{transformed}"')
            return transformed
    except Exception as e:
        print(f"CRAG transform error: {e}")

    return query


async def corrective_rag(
    query: str,
    chunks: list[dict],
    threshold: float,
    api_key: str,
    retrieve_fn: Callable[[str], Awaitable[list[dict]]],
) -> dict:
    """CRAG: Corrective RAG — detects low-quality retrieval and triggers correction."""
    assessment = await assess_retrieval_quality(query, chunks, api_key)

    # Good retrieval
    if assessment["isRelevant"] and assessment["score"] >= threshold:
        return {"chunks": chunks, "corrected": False, "action": "use"}

    # Poor retrieval
    if not assessment["isRelevant"] or assessment["score"] < threshold * 0.5:
        print(f"CRAG: Poor retrieval ({assessment['score']:.2f}), refining query...")

        refined_query = await _transform_query_for_crag(query, api_key)

        if refined_query != query:
            new_chunks = await retrieve_fn(refined_query)

            seen = {f"{c['document_id']}-{c['chunk_index']}" for c in chunks}
            merged = list(chunks)
            for chunk in new_chunks:
                key = f"{chunk['document_id']}-{chunk['chunk_index']}"
                if key not in seen:
                    merged.append(chunk)
                    seen.add(key)

            return {"chunks": merged, "corrected": True, "action": "refine", "refinedQuery": refined_query}

    # Ambiguous
    return {"chunks": chunks, "corrected": False, "action": "ambiguous"}


async def expand_to_parent_chunks(chunks: list[dict], max_depth: int, supabase_client) -> list[dict]:
    """Expand to parent chunks for hierarchical retrieval."""
    if not chunks or max_depth <= 0:
        return chunks

    parent_indices = set()
    document_ids = set()

    for chunk in chunks:
        pi = chunk.get("parent_index")
        if pi is not None:
            parent_indices.add(pi)
            document_ids.add(chunk["document_id"])

    if not parent_indices:
        print("No parent chunks to expand")
        return chunks

    try:
        resp = (
            supabase_client.table("document_chunks")
            .select("id, document_id, chunk_index, content, is_parent")
            .in_("document_id", list(document_ids))
            .in_("chunk_index", list(parent_indices))
            .eq("is_parent", True)
            .execute()
        )

        parent_data = resp.data or []

        if parent_data:
            docs_resp = (
                supabase_client.table("documents")
                .select("id, name")
                .in_("id", list(document_ids))
                .execute()
            )
            doc_map = {d["id"]: d["name"] for d in (docs_resp.data or [])}

            expanded = list(chunks)
            seen = {f"{c['document_id']}-{c['chunk_index']}" for c in chunks}

            for parent in parent_data:
                key = f"{parent['document_id']}-{parent['chunk_index']}"
                if key not in seen:
                    expanded.append({
                        "id": parent["id"],
                        "document_id": parent["document_id"],
                        "document_name": doc_map.get(parent["document_id"], "Unknown"),
                        "chunk_index": parent["chunk_index"],
                        "content": parent["content"],
                        "similarity": 0.5,
                        "is_parent": True,
                    })
                    seen.add(key)

            print(f"Expanded {len(chunks)} chunks to {len(expanded)} with parent context")
            return expanded
    except Exception as e:
        print(f"Parent expansion error: {e}")

    return chunks


def update_retrieval_weights(current_weights: dict, feedback: dict, learning_rate: float) -> dict:
    """Update retrieval weights based on feedback (exponential moving average)."""
    adjustment = (
        learning_rate * (feedback.get("avgSimilarity", 0.5) - 0.5)
        if feedback.get("wasUseful")
        else -learning_rate * 0.1
    )

    new_semantic = max(0.3, min(0.9, current_weights.get("semantic", 0.7) + adjustment))
    new_keyword = 1 - new_semantic

    total = new_semantic + new_keyword
    new_semantic /= total
    new_keyword /= total

    print(f"Feedback weights update: semantic {current_weights.get('semantic', 0.7):.2f} -> {new_semantic:.2f}")
    return {"semantic": new_semantic, "keyword": new_keyword}
