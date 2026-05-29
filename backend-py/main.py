import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from routes.upload_document import router as upload_document_router
from routes.ask_question import router as ask_question_router
from routes.reprocess_document import router as reprocess_document_router
from routes.create_skill import router as create_skill_router
from routes.parse_prompt_document import router as parse_prompt_document_router
from routes.documents import router as documents_router
from routes.skills import router as skills_router
from routes.configs import router as configs_router
from routes.assessment_documents import router as assessment_documents_router

app = FastAPI()


@app.on_event("startup")
async def recover_stale_processing():
    """Mark documents stuck in 'processing' as error on startup.

    If Render restarted the process mid-task, these documents will never
    finish.  Mark them so the user can retry.
    """
    try:
        from services.supabase_client import get_supabase_client

        supabase = get_supabase_client()
        resp = (
            supabase.table("documents")
            .update({"status": "error", "error_message": "Processing interrupted by server restart. Please re-upload or reprocess."})
            .eq("status", "processing")
            .execute()
        )
        if resp.data:
            print(f"[STARTUP] Recovered {len(resp.data)} stale processing document(s)")
    except Exception as e:
        print(f"[STARTUP] Stale processing recovery failed: {e}")


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(upload_document_router, prefix="/api")
app.include_router(ask_question_router, prefix="/api")
app.include_router(reprocess_document_router, prefix="/api")
app.include_router(create_skill_router, prefix="/api")
app.include_router(parse_prompt_document_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(configs_router, prefix="/api")
app.include_router(assessment_documents_router, prefix="/api")


@app.get("/api/health")
async def health():
    from datetime import datetime, timezone

    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc) or "Internal server error"},
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    print(f"Server running on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
