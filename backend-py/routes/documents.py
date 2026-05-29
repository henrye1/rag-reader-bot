from fastapi import APIRouter, HTTPException, Query
from services.supabase_client import get_supabase_client

router = APIRouter()


@router.get("/documents/status")
async def get_document_statuses(ids: str = Query(..., description="Comma-separated document IDs")):
    """Return id, status, total_chunks for the requested document IDs."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return []

    supabase = get_supabase_client()
    result = supabase.table("documents").select("id, status, total_chunks, error_message, original_extracted_text").in_("id", id_list).execute()
    # Return has_original_text flag (boolean) instead of the full text blob
    rows = []
    for row in result.data or []:
        rows.append({
            "id": row["id"],
            "status": row["status"],
            "total_chunks": row.get("total_chunks"),
            "error_message": row.get("error_message"),
            "has_original_text": bool(row.get("original_extracted_text")),
        })
    return rows


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document and its chunks (cascade handled by DB FK)."""
    supabase = get_supabase_client()

    # Delete chunks first (in case no cascade)
    supabase.table("document_chunks").delete().eq("document_id", document_id).execute()
    # Delete document
    supabase.table("documents").delete().eq("id", document_id).execute()

    return {"success": True}
