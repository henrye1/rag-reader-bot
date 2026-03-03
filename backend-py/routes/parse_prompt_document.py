"""POST /api/parse-prompt-document — Text extraction from prompt/knowledge documents."""

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse

from services.document_parser import parse_document

router = APIRouter()


@router.post("/parse-prompt-document")
async def parse_prompt_document(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        filename = file.filename or "unknown"
        content_type = file.content_type or ""

        print(f"Processing prompt document: {filename}, type: {content_type}, size: {len(file_bytes)}")

        prompt_text = parse_document(file_bytes, filename, content_type)

        if not prompt_text.strip():
            raise ValueError("The uploaded file is empty or no text could be extracted")

        return {"promptText": prompt_text}

    except Exception as e:
        print(f"Parse prompt document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
