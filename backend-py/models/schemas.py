"""Pydantic models / type definitions for request validation."""

from typing import Optional


# Note: We use plain dicts for responses (camelCase keys match frontend).
# These are just reference types for documentation purposes.

# IngestionConfig fields (from request body):
# chunking_strategy: "fixed" | "semantic" | "proposition" | "hierarchical"
# chunk_size: int
# chunk_overlap: int
# enable_context_enrichment: bool
# enable_metadata_extraction: bool
# enable_summary_chunks: bool
# preserve_tables: bool
# preserve_lists: bool
# extract_entities: bool
# parser_preference: "auto" | "llamaparse" | "gemini"

DEFAULT_INGESTION_CONFIG = {
    "chunking_strategy": "fixed",
    "chunk_size": 2000,
    "chunk_overlap": 200,
    "enable_context_enrichment": False,
    "enable_metadata_extraction": False,
    "enable_summary_chunks": False,
    "preserve_tables": True,
    "preserve_lists": True,
    "extract_entities": False,
    "parser_preference": "auto",
}

DEFAULT_OUTPUT_FORMAT = {
    "output_style": "audit",
    "include_executive_summary": True,
    "include_per_document_analysis": True,
    "include_cross_references": True,
    "extract_tables": True,
    "extract_statistics": True,
    "extract_model_parameters": True,
    "citation_format": "detailed",
    "include_page_numbers": True,
    "include_section_references": True,
    "response_detail_level": "comprehensive",
}

DEFAULT_POPIA_CONFIG = {
    "enablePIIDetection": True,
    "enableAutoRedaction": False,
    "redactEmails": True,
    "redactPhones": True,
    "redactIDNumbers": True,
    "redactCreditCards": True,
    "showComplianceIndicators": True,
    "logAPIRequests": True,
}
