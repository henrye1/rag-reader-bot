"""Advanced Text Chunking Module for RAG.

Supports: Fixed, Semantic, Proposition, and Hierarchical chunking.
"""

import re
import math
from services.gemini_client import generate_content, extract_json


def estimate_tokens(text: str) -> int:
    """Simple token estimation (~4 characters per token for English)."""
    return math.ceil(len(text) / 4)


def clean_text(text: str) -> str:
    """Clean and normalize text."""
    text = re.sub(r"[ \t]+", " ", text)
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "]

DEFAULT_OPTIONS = {
    "strategy": "fixed",
    "chunkSize": 2000,
    "chunkOverlap": 200,
    "separators": DEFAULT_SEPARATORS,
    "enableContextEnrichment": False,
    "enableMetadataExtraction": False,
    "enableSummaryChunks": False,
    "preserveTables": True,
    "preserveLists": True,
    "extractEntities": False,
}


async def chunk_text(text: str, options: dict | None = None, api_key: str | None = None) -> list[dict]:
    """Main chunking function — routes to appropriate strategy.

    Returns list of chunk dicts with keys:
      content, index, startChar, endChar, tokenCount,
      metadata?, parentIndex?, isParent?, sectionTitle?
    """
    opts = {**DEFAULT_OPTIONS, **(options or {})}

    if not text or not text.strip():
        return []

    normalized = clean_text(text)

    if opts["preserveTables"]:
        normalized = _preserve_table_structure(normalized)
    if opts["preserveLists"]:
        normalized = _preserve_list_structure(normalized)

    strategy = opts["strategy"]

    if strategy == "semantic":
        if not api_key:
            print("No API key for semantic chunking, falling back to fixed")
            chunks = _fixed_chunking(normalized, opts)
        else:
            chunks = await _semantic_chunking(normalized, opts, api_key)
    elif strategy == "proposition":
        if not api_key:
            print("No API key for proposition chunking, falling back to fixed")
            chunks = _fixed_chunking(normalized, opts)
        else:
            chunks = await _proposition_chunking(normalized, opts, api_key)
    elif strategy == "hierarchical":
        if not api_key:
            print("No API key for hierarchical chunking, falling back to fixed")
            chunks = _fixed_chunking(normalized, opts)
        else:
            chunks = await _hierarchical_chunking(normalized, opts, api_key)
    else:
        chunks = _fixed_chunking(normalized, opts)

    # Post-processing enhancements
    if opts["enableContextEnrichment"] and len(chunks) > 1:
        chunks = _enrich_with_context(chunks, normalized)

    if opts["enableMetadataExtraction"]:
        chunks = _extract_metadata(chunks, normalized)

    return chunks


# ==========================================================
# FIXED SIZE CHUNKING (Default — Fast)
# ==========================================================

def _fixed_chunking(text: str, opts: dict) -> list[dict]:
    chunks: list[dict] = []
    start = 0
    chunk_idx = 0
    chunk_size = opts["chunkSize"]
    overlap = opts["chunkOverlap"]
    separators = opts["separators"]

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Find good split point
        if end < len(text):
            search_start = max(start + chunk_size - 300, start)
            search_end = min(start + chunk_size + 100, len(text))
            search_text = text[search_start:search_end]

            best_split = -1
            for sep in separators:
                pos = search_text.rfind(sep)
                if pos != -1:
                    absolute_pos = search_start + pos + len(sep)
                    if absolute_pos > start + chunk_size // 2 and absolute_pos < len(text):
                        best_split = absolute_pos
                        break

            if best_split != -1:
                end = best_split

        content = text[start:end].strip()

        if content:
            chunks.append({
                "content": content,
                "index": chunk_idx,
                "startChar": start,
                "endChar": end,
                "tokenCount": estimate_tokens(content),
            })
            chunk_idx += 1

        next_start = end - overlap
        start = end if next_start <= start else next_start

    return chunks


# ==========================================================
# SEMANTIC CHUNKING (LLM-based boundaries)
# ==========================================================

async def _semantic_chunking(text: str, opts: dict, api_key: str) -> list[dict]:
    paragraphs = [p for p in text.split("\n\n") if p.strip()]

    if len(paragraphs) <= 3:
        return _fixed_chunking(text, opts)

    try:
        prompt = f"""Analyze this text and identify the major semantic sections or topic boundaries. Return a JSON array of section boundaries.

TEXT:
{text[:8000]}

Return JSON in this format only:
{{
  "sections": [
    {{"start": 0, "end": 500, "title": "Introduction"}},
    {{"start": 500, "end": 1200, "title": "Main Topic"}}
  ]
}}

Rules:
1. Each section should be 500-2000 characters
2. Split at natural topic changes
3. Return ONLY valid JSON"""

        response_text = await generate_content(prompt, temperature=0, max_output_tokens=2000, api_key=api_key)
        parsed = extract_json(response_text)

        if parsed and isinstance(parsed, dict) and "sections" in parsed and isinstance(parsed["sections"], list):
            chunks: list[dict] = []
            for i, section in enumerate(parsed["sections"]):
                start_idx = max(0, section.get("start", 0))
                end_idx = min(len(text), section.get("end", len(text)))
                content = text[start_idx:end_idx].strip()

                if content:
                    chunks.append({
                        "content": content,
                        "index": i,
                        "startChar": start_idx,
                        "endChar": end_idx,
                        "tokenCount": estimate_tokens(content),
                        "sectionTitle": section.get("title"),
                    })

            if chunks:
                print(f"Semantic chunking created {len(chunks)} chunks")
                return chunks
    except Exception as e:
        print(f"Semantic chunking error: {e}")

    return _fixed_chunking(text, opts)


# ==========================================================
# PROPOSITION CHUNKING (Atomic facts)
# ==========================================================

async def _proposition_chunking(text: str, opts: dict, api_key: str) -> list[dict]:
    base_chunks = _fixed_chunking(text, {**opts, "chunkSize": opts["chunkSize"] * 2})
    all_props: list[dict] = []
    prop_idx = 0

    for base in base_chunks:
        try:
            prompt = f"""Extract atomic propositions (single facts) from this text. Each proposition should be a self-contained statement.

TEXT:
{base['content']}

Return JSON array of propositions:
["Proposition 1", "Proposition 2", ...]

Rules:
1. Each proposition should be a single, verifiable fact
2. Include context needed to understand the proposition
3. Keep entity names and specific values
4. Return ONLY the JSON array"""

            response_text = await generate_content(prompt, temperature=0, max_output_tokens=2000, api_key=api_key)
            parsed = extract_json(response_text)

            if parsed and isinstance(parsed, list):
                for prop in parsed:
                    if isinstance(prop, str) and prop.strip():
                        all_props.append({
                            "content": prop.strip(),
                            "index": prop_idx,
                            "startChar": base["startChar"],
                            "endChar": base["endChar"],
                            "tokenCount": estimate_tokens(prop),
                        })
                        prop_idx += 1
        except Exception as e:
            print(f"Proposition extraction error: {e}")
            all_props.append({**base, "index": prop_idx})
            prop_idx += 1

    if all_props:
        print(f"Proposition chunking created {len(all_props)} chunks")
        return all_props

    return _fixed_chunking(text, opts)


# ==========================================================
# HIERARCHICAL CHUNKING (Parent-Child)
# ==========================================================

async def _hierarchical_chunking(text: str, opts: dict, api_key: str) -> list[dict]:
    parent_chunks = _fixed_chunking(text, {**opts, "chunkSize": opts["chunkSize"] * 3, "chunkOverlap": 0})
    all_chunks: list[dict] = []

    for parent_idx, parent in enumerate(parent_chunks):
        # Generate summary for parent
        parent_summary = parent["content"][:500]
        try:
            prompt = f"""Summarize this text in 2-3 sentences, capturing the key points:

{parent['content']}

Return ONLY the summary, no other text."""

            summary = await generate_content(prompt, temperature=0.2, max_output_tokens=200, api_key=api_key)
            if summary:
                parent_summary = summary.strip()
        except Exception as e:
            print(f"Summary generation error: {e}")

        # Add parent chunk (summary)
        all_chunks.append({
            "content": parent_summary,
            "index": len(all_chunks),
            "startChar": parent["startChar"],
            "endChar": parent["endChar"],
            "tokenCount": estimate_tokens(parent_summary),
            "isParent": True,
        })

        # Create child chunks from parent content
        child_chunks = _fixed_chunking(parent["content"], {**opts, "chunkSize": opts["chunkSize"]})
        for child in child_chunks:
            all_chunks.append({
                "content": child["content"],
                "index": len(all_chunks),
                "startChar": parent["startChar"] + child["startChar"],
                "endChar": parent["startChar"] + child["endChar"],
                "tokenCount": child["tokenCount"],
                "parentIndex": parent_idx,
                "isParent": False,
            })

    print(f"Hierarchical chunking created {len(all_chunks)} chunks ({len(parent_chunks)} parents)")
    return all_chunks


# ==========================================================
# ENHANCEMENT FUNCTIONS
# ==========================================================

def _enrich_with_context(chunks: list[dict], full_text: str) -> list[dict]:
    context_window = 200

    for idx, chunk in enumerate(chunks):
        context_before = ""
        if idx > 0:
            start = max(0, chunk["startChar"] - context_window)
            context_before = full_text[start : chunk["startChar"]].strip()

        context_after = ""
        if idx < len(chunks) - 1:
            end = min(len(full_text), chunk["endChar"] + context_window)
            context_after = full_text[chunk["endChar"] : end].strip()

        metadata = chunk.get("metadata", {})
        if context_before:
            metadata["contextBefore"] = context_before
        if context_after:
            metadata["contextAfter"] = context_after
        chunk["metadata"] = metadata

    return chunks


def _extract_metadata(chunks: list[dict], full_text: str) -> list[dict]:
    heading_pattern = re.compile(r"^#+\s+(.+)$|^(.+)\n[=-]+$", re.MULTILINE)
    headings: list[dict] = []

    for match in heading_pattern.finditer(full_text):
        title = (match.group(1) or match.group(2) or "").strip()
        headings.append({"title": title, "position": match.start()})

    for chunk in chunks:
        relevant = [h for h in headings if h["position"] <= chunk["startChar"]]
        if relevant:
            section_title = chunk.get("sectionTitle") or relevant[-1]["title"]
            chunk["sectionTitle"] = section_title
            metadata = chunk.get("metadata", {})
            metadata["sectionTitle"] = section_title
            chunk["metadata"] = metadata

    return chunks


def _preserve_table_structure(text: str) -> str:
    return re.sub(
        r"(\|[^\n]+\|[\n\r]+)+",
        lambda m: f"\n<<<TABLE_START>>>\n{m.group()}\n<<<TABLE_END>>>\n",
        text,
    )


def _preserve_list_structure(text: str) -> str:
    return re.sub(
        r"((?:^[\s]*[-*\u2022]\s+.+$\n?)+)",
        lambda m: f"\n<<<LIST_START>>>\n{m.group()}\n<<<LIST_END>>>\n",
        text,
        flags=re.MULTILINE,
    )
