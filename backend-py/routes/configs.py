from fastapi import APIRouter
from services.supabase_client import get_supabase_client

router = APIRouter()


@router.get("/configs/rag-presets")
async def list_rag_presets():
    """List RAG configuration presets."""
    supabase = get_supabase_client()
    result = (
        supabase.table("rag_configs")
        .select("*")
        .eq("is_preset", True)
        .order("name")
        .execute()
    )
    return result.data or []


@router.get("/configs/retrieval-presets")
async def list_retrieval_presets():
    """List retrieval configuration presets."""
    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("retrieval_configs")
            .select("*")
            .eq("is_preset", True)
            .order("name")
            .execute()
        )
        return result.data or []
    except Exception:
        # Table may not exist yet; return empty so frontend falls back to client-side presets
        return []
