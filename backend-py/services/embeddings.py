"""Embedding generation using Gemini gemini-embedding-001 (768 dimensions via outputDimensionality)."""

import os
import httpx

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS = 768  # Match existing DB vector(768) column


def _api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    return key


async def generate_embedding(text: str, api_key: str | None = None) -> list[float]:
    """Generate embedding for a single document text (RETRIEVAL_DOCUMENT task)."""
    key = api_key or _api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent?key={key}"

    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": EMBEDDING_DIMS,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Embedding API error: {resp.text}")
        data = resp.json()
        return data["embedding"]["values"]


async def generate_query_embedding(query: str, api_key: str | None = None) -> list[float]:
    """Generate embedding optimized for queries (RETRIEVAL_QUERY task)."""
    key = api_key or _api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent?key={key}"

    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": query}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": EMBEDDING_DIMS,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Query embedding API error: {resp.text}")
        data = resp.json()
        return data["embedding"]["values"]


async def generate_embeddings_batch(texts: list[str], api_key: str | None = None) -> list[list[float]]:
    """Batch embedding for efficiency (up to 100 texts per call, recursive for larger)."""
    if not texts:
        return []

    key = api_key or _api_key()

    # Gemini batch limit is 100
    if len(texts) > 100:
        results: list[list[float]] = []
        for i in range(0, len(texts), 100):
            batch = texts[i : i + 100]
            batch_results = await generate_embeddings_batch(batch, key)
            results.extend(batch_results)
        return results

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:batchEmbedContents?key={key}"

    payload = {
        "requests": [
            {
                "model": f"models/{EMBEDDING_MODEL}",
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBEDDING_DIMS,
            }
            for t in texts
        ]
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Batch embedding API error: {resp.text}")
        data = resp.json()
        return [e["values"] for e in data["embeddings"]]
