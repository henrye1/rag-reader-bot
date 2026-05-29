"""LLM provider-routing layer.

Single entry point (`call_llm`) for text generation that routes to Google
Gemini or Anthropic Claude based on the `model` id. Provider differences live
only here. Embeddings are NOT handled here (Anthropic has no embeddings API) —
see embeddings.py, which always uses Google.
"""

import os
import httpx

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

DEFAULT_MODEL = "gemini-2.5-pro"

# Output-token ceiling per Claude model — clamp max_tokens so a request never 400s.
ANTHROPIC_MAX_OUTPUT = {
    "claude-opus-4-7": 128000,
    "claude-sonnet-4-6": 64000,
    "claude-haiku-4-5": 64000,
}

# Models the UI may select. Mirrors the frontend dropdown.
SUPPORTED_MODELS = [
    {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro", "provider": "google"},
    {"id": "claude-opus-4-7", "label": "Claude Opus 4.7", "provider": "anthropic"},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "provider": "anthropic"},
    {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5", "provider": "anthropic"},
]


def is_claude_model(model: str | None) -> bool:
    return bool(model) and model.lower().startswith("claude")


def make_llm(model: str | None = None) -> dict:
    """Build an llm config from a requested model id + environment keys."""
    return {
        "model": model or DEFAULT_MODEL,
        "google_api_key": os.getenv("GOOGLE_API_KEY"),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),
    }


async def call_llm(
    prompt: str,
    llm: dict,
    *,
    system: str | None = None,
    temperature: float = 0.3,
    max_output_tokens: int = 8192,
    timeout: float = 120.0,
) -> str:
    """Generate text from the configured model. Returns the response text.

    Raises RuntimeError on HTTP/transport errors so callers can fall back.
    """
    model = llm.get("model") or DEFAULT_MODEL
    if is_claude_model(model):
        return await _call_anthropic(
            prompt, model, llm.get("anthropic_api_key"), system, max_output_tokens, timeout
        )
    return await _call_gemini(
        prompt, model, llm.get("google_api_key"), system, temperature, max_output_tokens, timeout
    )


async def _call_gemini(
    prompt: str,
    model: str,
    api_key: str | None,
    system: str | None,
    temperature: float,
    max_output_tokens: int,
    timeout: float,
) -> str:
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not configured")

    text = f"{system}\n\n{prompt}" if system else prompt
    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text}")
        data = resp.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )


async def _call_anthropic(
    prompt: str,
    model: str,
    api_key: str | None,
    system: str | None,
    max_output_tokens: int,
    timeout: float,
) -> str:
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured (required for Claude models)")

    cap = ANTHROPIC_MAX_OUTPUT.get(model, 32000)
    max_tokens = min(max_output_tokens, cap)

    payload: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    # Cache the stable instruction prefix across calls in a run.
    if system:
        payload["system"] = [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
        ]

    # temperature / thinking / effort intentionally omitted: Opus 4.7 rejects
    # temperature (400) and effort errors on Haiku 4.5. Keeps one request shape
    # valid across every selectable Claude model.

    headers = {
        "content-type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(ANTHROPIC_API_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Anthropic API error ({resp.status_code}): {resp.text}")
        data = resp.json()
        blocks = data.get("content", []) or []
        return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
