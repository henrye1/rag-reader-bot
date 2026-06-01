"""CRUD for editable assessment working documents."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client

router = APIRouter()

TABLE = "assessment_documents"


def _serialize(row: dict) -> dict:
    """DB row (snake_case) -> frontend dict (camelCase)."""
    return {
        "id": row["id"],
        "title": row.get("title", ""),
        "entity": row.get("entity", ""),
        "reportingDate": row.get("reporting_date", ""),
        "documentIds": row.get("document_ids", []),
        "sections": row.get("sections", []),
        "sourceAssessment": row.get("source_assessment"),
        "updatedAt": row.get("updated_at"),
    }


@router.post("/assessment-documents")
async def create_document(request: Request):
    try:
        supabase = get_supabase_client()
        body = await request.json()
        payload = {
            "title": body.get("title", "Untitled assessment"),
            "entity": body.get("entity", ""),
            "reporting_date": body.get("reportingDate", ""),
            "document_ids": body.get("documentIds", []),
            "sections": body.get("sections", []),
            "source_assessment": body.get("sourceAssessment"),
        }
        result = supabase.table(TABLE).insert(payload).execute()
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Create assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/assessment-documents/{doc_id}")
async def get_document(doc_id: str):
    try:
        supabase = get_supabase_client()
        result = supabase.table(TABLE).select("*").eq("id", doc_id).limit(1).execute()
        if not result.data:
            return JSONResponse(status_code=404, content={"error": "Not found"})
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Get assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.put("/assessment-documents/{doc_id}")
async def update_document(doc_id: str, request: Request):
    try:
        from datetime import datetime, timezone
        supabase = get_supabase_client()
        body = await request.json()
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "title" in body: updates["title"] = body["title"]
        if "entity" in body: updates["entity"] = body["entity"]
        if "reportingDate" in body: updates["reporting_date"] = body["reportingDate"]
        if "documentIds" in body: updates["document_ids"] = body["documentIds"]
        if "sections" in body: updates["sections"] = body["sections"]
        if "sourceAssessment" in body: updates["source_assessment"] = body["sourceAssessment"]
        result = supabase.table(TABLE).update(updates).eq("id", doc_id).execute()
        if not result.data:
            return JSONResponse(status_code=404, content={"error": "Not found"})
        return _serialize(result.data[0])
    except Exception as e:
        print(f"Update assessment document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
