"""POST /api/reprocess-document — Re-chunk and re-embed existing documents."""

import os
import time
from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from services.supabase_client import get_supabase_client
from services.chunking import chunk_text
from services.embeddings import generate_embeddings_batch
from models.schemas import DEFAULT_INGESTION_CONFIG

router = APIRouter()


@router.post("/reprocess-document")
async def reprocess_document(request: Request, background_tasks: BackgroundTasks):
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        body = await request.json()
        document_id = body.get("documentId")
        request_config = body.get("ingestionConfig")

        if not document_id:
            raise ValueError("No documentId provided")

        config = {**DEFAULT_INGESTION_CONFIG, **(request_config or {})}

        supabase = get_supabase_client()

        print(f"Reprocessing document: {document_id}")

        # Fetch document with original text
        resp = (
            supabase.table("documents")
            .select("id, name, original_extracted_text, status")
            .eq("id", document_id)
            .single()
            .execute()
        )

        document = resp.data
        if not document:
            raise ValueError("Document not found")
        if not document.get("original_extracted_text"):
            raise ValueError("Document does not have stored original text. Please re-upload the document.")

        # Update status to processing
        supabase.table("documents").update({"status": "processing"}).eq("id", document_id).execute()

        # Return immediately — process in background
        background_tasks.add_task(_reprocess_in_background, document_id, document, config, api_key)

        return {
            "documentId": document_id,
            "displayName": document["name"],
            "status": "processing",
        }

    except Exception as e:
        print(f"Reprocess document error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


async def _reprocess_in_background(document_id: str, document: dict, config: dict, api_key: str):
    supabase = get_supabase_client()
    extracted_text = document["original_extracted_text"]

    try:
        print(f"Chunking with strategy: {config.get('chunking_strategy', 'fixed')}...")
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
        print(f"Created {len(chunks)} chunks")

        if not chunks:
            raise RuntimeError("No chunks created from document")

        print(f"Generating embeddings for {len(chunks)} chunks...")
        embeddings = await generate_embeddings_batch(
            [c["content"] for c in chunks], api_key
        )

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

        # Delete old chunks
        supabase.table("document_chunks").delete().eq("document_id", document_id).execute()

        # Insert new chunks in batches
        for i in range(0, len(chunk_records), 50):
            batch = chunk_records[i : i + 50]
            supabase.table("document_chunks").insert(batch).execute()

        # Update document metadata
        from datetime import datetime, timezone

        supabase.table("documents").update({
            "status": "ready",
            "total_chunks": len(chunks),
            "total_characters": len(extracted_text),
            "ingestion_config": config,
            "last_reprocessed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).execute()

        print(f"Document {document_id} reprocessed successfully with {len(chunks)} chunks")

    except Exception as e:
        print(f"Reprocessing error: {e}")
        supabase.table("documents").update({
            "status": "error",
            "error_message": str(e),
        }).eq("id", document_id).execute()
