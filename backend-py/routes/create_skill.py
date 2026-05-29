"""POST /api/create-skill — AI-powered expert skill generation."""

import os
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client
from services.gemini_client import generate_content_with_history, extract_json

router = APIRouter()

SKILL_CREATOR_PROMPT = """You are the Skill Creator - a meta-expert that generates new expert skills for a Document Q&A RAG system.

Your task is to analyze the user's description and generate a complete skill definition.

## OUTPUT FORMAT
You MUST respond with valid JSON in this exact structure:
{
  "skill": {
    "name": "Short descriptive name (3-5 words)",
    "description": "2-3 sentences describing the skill's purpose and capabilities",
    "category": "Best fitting category (see options below)",
    "icon": "Single emoji that represents the skill",
    "skill_type": "expert",
    "output_format": "text",
    "prompt_content": "Full expert knowledge framework (see structure below)"
  },
  "reasoning": "Brief explanation of your design choices",
  "suggested_use_cases": ["Use case 1", "Use case 2", "Use case 3"]
}

## CATEGORY OPTIONS
Choose the most appropriate:
- Financial Regulation
- Risk Management
- Compliance
- Audit
- Legal
- Technical
- Operations
- Document Generation
- Research
- Custom

## PROMPT_CONTENT STRUCTURE
The prompt_content should follow this framework:

You are an expert in [DOMAIN]. Your expertise includes:

## Core Competencies:
- [Area 1]: [Description]
- [Area 2]: [Description]
- [Area 3]: [Description]

## Assessment Framework:
When analyzing documents, evaluate:
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]
4. [Criterion 4]
5. [Criterion 5]

## Response Guidelines:
- [Style guideline 1]
- [Style guideline 2]
- [Style guideline 3]
- Always cite specific sections from the documents
- Provide actionable insights and recommendations

## Key Considerations:
- [Important factor 1]
- [Important factor 2]
- [Industry standards or regulations if applicable]

## INSTRUCTIONS
1. Parse the user's description to understand the domain and requirements
2. Generate a comprehensive expert profile
3. Include domain-specific terminology and standards
4. Create actionable assessment criteria
5. Ensure the skill is practical for document analysis
6. Output ONLY valid JSON - no markdown code blocks, no additional text"""


@router.post("/create-skill")
async def create_skill(request: Request):
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        body = await request.json()
        description = body.get("description", "")
        save_skill = body.get("saveSkill", False)

        if not description or not isinstance(description, str) or len(description.strip()) < 10:
            raise ValueError("Please provide a description of the skill you need (at least 10 characters)")

        print(f'Generating skill from description: "{description[:100]}..."')
        start_time = time.time()

        user_prompt = f"## USER REQUEST\n{description}\n\nGenerate a complete skill definition for this request. Remember to output ONLY valid JSON."

        messages = [
            {"role": "user", "parts": [{"text": SKILL_CREATOR_PROMPT}]},
            {"role": "model", "parts": [{"text": "I understand. I will generate skill definitions in valid JSON format only. Please provide the skill description."}]},
            {"role": "user", "parts": [{"text": user_prompt}]},
        ]

        raw_text = await generate_content_with_history(
            messages, temperature=0.7, max_output_tokens=4096, timeout=60.0, api_key=api_key
        )

        if not raw_text:
            raise RuntimeError("No response generated from AI")

        print(f"Raw AI response: {raw_text[:500]}")

        generated_skill = extract_json(raw_text)

        if not generated_skill or not isinstance(generated_skill, dict):
            raise ValueError("AI generated invalid response format. Please try again.")

        skill = generated_skill.get("skill", {})
        if not skill.get("name") or not skill.get("prompt_content"):
            raise ValueError("AI generated incomplete skill definition. Please try again with more detail.")

        processing_ms = int((time.time() - start_time) * 1000)
        print(f"Skill generated in {processing_ms}ms: {skill['name']}")

        saved_skill_id = None
        if save_skill:
            supabase = get_supabase_client()
            resp = (
                supabase.table("skills")
                .insert({
                    "name": skill["name"],
                    "description": skill.get("description", ""),
                    "category": skill.get("category", "Custom"),
                    "icon": skill.get("icon", "\U0001f3af"),
                    "skill_type": skill.get("skill_type", "expert"),
                    "output_format": skill.get("output_format", "text"),
                    "prompt_content": skill["prompt_content"],
                    "is_active": True,
                    "is_default": False,
                    "user_id": None,
                })
                .execute()
            )
            if resp.data:
                saved_skill_id = resp.data[0].get("id")
                print(f"Skill saved with ID: {saved_skill_id}")

        return {
            "success": True,
            "skill": skill,
            "reasoning": generated_skill.get("reasoning", ""),
            "suggested_use_cases": generated_skill.get("suggested_use_cases", []),
            "savedSkillId": saved_skill_id,
            "processingTimeMs": processing_ms,
        }

    except Exception as e:
        print(f"Error in create-skill: {e}")
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})
