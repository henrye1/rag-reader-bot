from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from services.supabase_client import get_supabase_client

router = APIRouter()


@router.get("/skills")
async def list_skills(active_only: bool = Query(False)):
    """List skills, optionally filtering to active-only."""
    supabase = get_supabase_client()
    query = supabase.table("skills").select("*")

    if active_only:
        query = query.eq("is_active", True)

    query = query.order("is_default", desc=True).order("category").order("name")
    result = query.execute()
    return result.data or []


@router.post("/skills")
async def create_skill(request: Request):
    """Create a new skill."""
    body = await request.json()

    required = ["name", "prompt_content"]
    for field in required:
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    supabase = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "name": body["name"],
        "description": body.get("description"),
        "category": body.get("category", "Custom"),
        "icon": body.get("icon", "\U0001f3af"),  # target emoji
        "prompt_content": body["prompt_content"],
        "questions_template": body.get("questions_template"),
        "is_active": body.get("is_active", True),
        "is_default": body.get("is_default", False),
        "user_id": body.get("user_id"),
        "skill_type": body.get("skill_type", "expert"),
        "output_format": body.get("output_format", "text"),
        "created_at": now,
        "updated_at": now,
    }

    result = supabase.table("skills").insert(row).execute()
    if result.data:
        return result.data[0]
    raise HTTPException(status_code=500, detail="Failed to create skill")


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, request: Request):
    """Update an existing skill."""
    body = await request.json()
    supabase = get_supabase_client()

    updates = {}
    allowed = [
        "name", "description", "category", "icon", "prompt_content",
        "questions_template", "is_active", "is_default",
    ]
    for key in allowed:
        if key in body:
            updates[key] = body[key]

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = supabase.table("skills").update(updates).eq("id", skill_id).execute()
    if result.data:
        return result.data[0]
    raise HTTPException(status_code=404, detail="Skill not found")


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a skill."""
    supabase = get_supabase_client()
    supabase.table("skills").delete().eq("id", skill_id).execute()
    return {"success": True}
