import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chunkText, ChunkingStrategy } from "../_shared/chunking.ts";
import { generateEmbeddingsBatch } from "../_shared/embeddings.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parser preference type
type ParserPreference = 'auto' | 'llamaparse' | 'gemini';

// Ingestion configuration interface
interface IngestionConfig {
  chunking_strategy: ChunkingStrategy;
  chunk_size: number;
  chunk_overlap: number;
  enable_context_enrichment: boolean;
  enable_metadata_extraction: boolean;
  enable_summary_chunks: boolean;
  preserve_tables: boolean;
  preserve_lists: boolean;
  extract_entities: boolean;
  parser_preference: ParserPreference;
}

const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  chunking_strategy: 'fixed',
  chunk_size: 2000,
  chunk_overlap: 200,
  enable_context_enrichment: false,
  enable_metadata_extraction: false,
  enable_summary_chunks: false,
  preserve_tables: true,
  preserve_lists: true,
  extract_entities: false,
  parser_preference: 'auto',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    const supabase = getSupabaseClient();

    // Parse request body
    const { documentId, ingestionConfig: requestConfig } = await req.json();

    if (!documentId) {
      throw new Error("No documentId provided");
    }

    // Merge with defaults
    const ingestionConfig: IngestionConfig = {
      ...DEFAULT_INGESTION_CONFIG,
      ...(requestConfig || {}),
    };

    console.log(`Reprocessing document: ${documentId}`);
    console.log(`New config: strategy=${ingestionConfig.chunking_strategy}, chunkSize=${ingestionConfig.chunk_size}`);

    // Fetch document with original text
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('id, name, original_extracted_text, status')
      .eq('id', documentId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch document: ${fetchError.message}`);
    }

    if (!document) {
      throw new Error("Document not found");
    }

    if (!document.original_extracted_text) {
      throw new Error("Document does not have stored original text. It may have been uploaded before this feature was enabled. Please re-upload the document.");
    }

    const extractedText = document.original_extracted_text;
    console.log(`Found original text: ${extractedText.length} characters`);

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    try {
      // Chunk the text with new config
      console.log(`Chunking with strategy: ${ingestionConfig.chunking_strategy}...`);
      const chunks = await chunkText(
        extractedText,
        {
          strategy: ingestionConfig.chunking_strategy,
          chunkSize: ingestionConfig.chunk_size,
          chunkOverlap: ingestionConfig.chunk_overlap,
          enableContextEnrichment: ingestionConfig.enable_context_enrichment,
          enableMetadataExtraction: ingestionConfig.enable_metadata_extraction,
          enableSummaryChunks: ingestionConfig.enable_summary_chunks,
          preserveTables: ingestionConfig.preserve_tables,
          preserveLists: ingestionConfig.preserve_lists,
          extractEntities: ingestionConfig.extract_entities,
        },
        GOOGLE_API_KEY
      );
      console.log(`Created ${chunks.length} chunks using ${ingestionConfig.chunking_strategy} strategy`);

      if (chunks.length === 0) {
        throw new Error("No chunks created from document");
      }

      // Generate embeddings for all chunks
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddings = await generateEmbeddingsBatch(
        chunks.map(c => c.content),
        GOOGLE_API_KEY
      );
      console.log(`Generated ${embeddings.length} embeddings`);

      // Prepare new chunk records
      const chunkRecords = chunks.map((chunk, i) => ({
        document_id: documentId,
        chunk_index: chunk.index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: `[${embeddings[i].embedding.join(',')}]`,
      }));

      // Delete old chunks
      const { error: deleteError } = await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId);

      if (deleteError) {
        throw new Error(`Failed to delete old chunks: ${deleteError.message}`);
      }
      console.log('Deleted old chunks');

      // Insert new chunks in batches
      for (let i = 0; i < chunkRecords.length; i += 50) {
        const batch = chunkRecords.slice(i, i + 50);
        const { error: chunkError } = await supabase
          .from('document_chunks')
          .insert(batch);

        if (chunkError) {
          throw new Error(`Failed to insert chunks batch ${i}: ${chunkError.message}`);
        }
      }
      console.log(`Inserted ${chunkRecords.length} new chunks`);

      // Update document metadata
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: 'ready',
          total_chunks: chunks.length,
          total_characters: extractedText.length,
          ingestion_config: ingestionConfig,
          last_reprocessed_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`Document ${documentId} reprocessed successfully with ${chunks.length} chunks`);

      return new Response(
        JSON.stringify({
          documentId: documentId,
          displayName: document.name,
          status: 'ready',
          totalChunks: chunks.length,
          totalCharacters: extractedText.length,
          reprocessedAt: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    } catch (processingError) {
      console.error("Reprocessing error:", processingError);

      // Update document with error status
      await supabase
        .from('documents')
        .update({
          status: 'error',
          error_message: processingError instanceof Error ? processingError.message : 'Reprocessing failed',
        })
        .eq('id', documentId);

      throw processingError;
    }

  } catch (error) {
    console.error("Reprocess document error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
