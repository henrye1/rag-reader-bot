"""POST /api/upload-document — File upload with background processing."""

import os
import time
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client
from services.document_parser import parse_document
from services.chunking import chunk_text, clean_text
from services.embeddings import generate_embeddings_batch
from models.schemas import DEFAULT_INGESTION_CONFIG

import json

router = APIRouter()


@router.post("/upload-document")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ingestionConfig: str = Form(None),
):
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        supabase = get_supabase_client()

        # Parse ingestion config
        config = dict(DEFAULT_INGESTION_CONFIG)
        if ingestionConfig:
            try:
                config.update(json.loads(ingestionConfig))
            except json.JSONDecodeError:
                print("Failed to parse ingestion config, using defaults")

        file_bytes = await file.read()
        filename = file.filename or "unknown"
        content_type = file.content_type or ""
        file_size = len(file_bytes)

        print(f"[START] Uploading file: {filename}, size: {file_size} bytes, type: {content_type}")

        # Determine file type
        lower = filename.lower()
        if content_type == "application/json" or lower.endswith(".json"):
            file_type = "json"
        elif content_type == "text/plain" or lower.endswith(".txt"):
            file_type = "txt"
        elif content_type == "application/pdf" or lower.endswith(".pdf"):
            file_type = "pdf"
        elif lower.endswith(".docx"):
            file_type = "docx"
        elif lower.endswith(".doc"):
            file_type = "doc"
        else:
            file_type = "unknown"

        # Create document record
        resp = (
            supabase.table("documents")
            .insert({"name": filename, "file_type": file_type, "status": "processing"})
            .execute()
        )

        if not resp.data:
            raise RuntimeError("Failed to create document record")

        document_id = resp.data[0]["id"]
        print(f"Created document record: {document_id}")

        # Return immediately — process in background
        background_tasks.add_task(
            _process_document, document_id, file_bytes, filename, content_type, file_type, config, api_key
        )

        return {
            "documentId": document_id,
            "displayName": filename,
            "status": "processing",
        }

    except Exception as e:
        print(f"Upload document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


async def _process_document(
    document_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    file_type: str,
    config: dict,
    api_key: str,
):
    start_time = time.time()
    supabase = get_supabase_client()

    try:
        # Extract text using native Python parsing
        extracted_text = parse_document(file_bytes, filename, content_type)
        extracted_text = clean_text(extracted_text)

        if not extracted_text or len(extracted_text) < 10:
            raise RuntimeError("Could not extract meaningful text from document")

        print(f"Extracted {len(extracted_text)} characters from {filename}")

        # Store original text for re-processing
        supabase.table("documents").update({
            "original_extracted_text": extracted_text,
            "ingestion_config": config,
        }).eq("id", document_id).execute()

        # Chunk the text
        chunk_start = time.time()
        print(f"[CHUNKING] Starting with strategy: {config.get('chunking_strategy', 'fixed')}...")

        chunks = await chunk_text(
            extracted_text,
            {
                "strategy": config.get("chunking_strategy", "fixed"),
                "chunkSize": config.get("chunk_size", 2000),
                "chunkOverlap": config.get("chunk_overlap", 200),
                "enableContextEnrichment": config.get("enable_context_enrichment", False),
                "enableMetadataExtraction": config.get("enable_metadata_extraction", False),
                "enableSummaryChunks": config.get("enable_summary_chunks", False),
                "preserveTables": config.get("preserve_tables", True),
                "preserveLists": config.get("preserve_lists", True),
                "extractEntities": config.get("extract_entities", False),
            },
            api_key,
        )
        print(f"[CHUNKING] Created {len(chunks)} chunks in {int((time.time() - chunk_start) * 1000)}ms")

        if not chunks:
            raise RuntimeError("No chunks created from document")

        # Generate embeddings
        embed_start = time.time()
        print(f"[EMBEDDINGS] Generating for {len(chunks)} chunks...")
        embeddings = await generate_embeddings_batch(
            [c["content"] for c in chunks], api_key
        )
        print(f"[EMBEDDINGS] Generated {len(embeddings)} embeddings in {int((time.time() - embed_start) * 1000)}ms")

        # Insert chunks with embeddings in batches of 50
        chunk_records = [
            {
                "document_id": document_id,
                "chunk_index": chunk["index"],
                "content": chunk["content"],
                "token_count": chunk["tokenCount"],
                "embedding": f"[{','.join(str(v) for v in embeddings[i])}]",
            }
            for i, chunk in enumerate(chunks)
        ]

        for i in range(0, len(chunk_records), 50):
            batch = chunk_records[i : i + 50]
            resp = supabase.table("document_chunks").insert(batch).execute()

        print(f"Inserted {len(chunk_records)} chunks into database")

        # Update document status to ready
        supabase.table("documents").update({
            "status": "ready",
            "total_chunks": len(chunks),
            "total_characters": len(extracted_text),
        }).eq("id", document_id).execute()

        total_ms = int((time.time() - start_time) * 1000)
        print(f"[DONE] Document {document_id} ready with {len(chunks)} chunks in {total_ms}ms")

    except Exception as e:
        print(f"Processing error: {e}")
        supabase.table("documents").update({
            "status": "error",
            "error_message": str(e),
        }).eq("id", document_id).execute()
