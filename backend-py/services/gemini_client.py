"""Shared Gemini generation helper wrapping the REST API."""

import os
import json
import re
import httpx

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    return key


async def generate_content(
    prompt: str,
    *,
    temperature: float = 0.3,
    max_output_tokens: int = 8192,
    timeout: float = 120.0,
    api_key: str | None = None,
) -> str:
    """Single-turn generation. Returns the text response."""
    key = api_key or _api_key()
    url = f"{GEMINI_API_BASE}/gemini-2.5-pro:generateContent?key={key}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
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
        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


async def generate_content_with_history(
    messages: list[dict],
    *,
    temperature: float = 0.3,
    max_output_tokens: int = 8192,
    timeout: float = 120.0,
    api_key: str | None = None,
) -> str:
    """Multi-turn generation. messages is a list of {role, parts} dicts."""
    key = api_key or _api_key()
    url = f"{GEMINI_API_BASE}/gemini-2.5-pro:generateContent?key={key}"

    payload = {
        "contents": messages,
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
        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def extract_json(text: str) -> dict | list | None:
    """Try to extract JSON object or array from LLM response text."""
    if not text:
        return None

    # Strip markdown code blocks
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    # Try direct parse
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object
    obj_match = re.search(r"\{[\s\S]*\}", text)
    if obj_match:
        try:
            return json.loads(obj_match.group())
        except json.JSONDecodeError:
            pass

    # Try to find JSON array
    arr_match = re.search(r"\[[\s\S]*\]", text)
    if arr_match:
        try:
            return json.loads(arr_match.group())
        except json.JSONDecodeError:
            pass

    return None
