import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chunkText, cleanText, ChunkingStrategy } from "../_shared/chunking.ts";
import { generateEmbeddingsBatch } from "../_shared/embeddings.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { parseWithLlamaParse, isLlamaParseAvailable, isLlamaParseSupported } from "../_shared/llamaparse.ts";

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

/**
 * Determine whether to use LlamaParse based on file type and preference
 */
function shouldUseLlamaParse(file: File, preference: ParserPreference): boolean {
  // If LlamaParse is not available, always use Gemini
  if (!isLlamaParseAvailable()) {
    console.log('LlamaParse not available (no API key), using Gemini');
    return false;
  }

  // If explicitly set to Gemini, use Gemini
  if (preference === 'gemini') {
    return false;
  }

  // If explicitly set to LlamaParse, use it (if file type is supported)
  if (preference === 'llamaparse') {
    return isLlamaParseSupported(file.name, file.type);
  }

  // Auto mode: Use LlamaParse for PDF and Word documents
  // LlamaParse excels at complex document layouts, tables, and multi-column text
  return isLlamaParseSupported(file.name, file.type);
}

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

    // Get the file and config from the form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const ingestionConfigStr = formData.get("ingestionConfig") as string | null;

    if (!file) {
      throw new Error("No file provided");
    }

    // Parse ingestion config or use defaults
    let ingestionConfig: IngestionConfig = DEFAULT_INGESTION_CONFIG;
    if (ingestionConfigStr) {
      try {
        ingestionConfig = { ...DEFAULT_INGESTION_CONFIG, ...JSON.parse(ingestionConfigStr) };
      } catch (e) {
        console.warn("Failed to parse ingestion config, using defaults:", e);
      }
    }

    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    console.log(`Ingestion config: strategy=${ingestionConfig.chunking_strategy}, chunkSize=${ingestionConfig.chunk_size}, overlap=${ingestionConfig.chunk_overlap}`);

    // Determine file type
    let fileType = 'unknown';
    if (file.type === "application/json" || file.name.endsWith(".json")) {
      fileType = 'json';
    } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      fileType = 'txt';
    } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      fileType = 'pdf';
    } else if (file.name.endsWith(".docx")) {
      fileType = 'docx';
    } else if (file.name.endsWith(".doc")) {
      fileType = 'doc';
    }

    // Create document record in Supabase (status: processing)
    const { data: documentRecord, error: insertError } = await supabase
      .from('documents')
      .insert({
        name: file.name,
        file_type: fileType,
        status: 'processing',
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create document record:", insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    const documentId = documentRecord.id;
    console.log(`Created document record: ${documentId}`);

    let extractedText = '';
    let originalFileId: string | null = null;

    try {
      // Extract text based on file type
      if (fileType === 'json') {
        const jsonContent = await file.text();
        // Validate JSON
        try {
          const parsed = JSON.parse(jsonContent);
          // Extract text content from JSON - handle various structures
          extractedText = typeof parsed === 'string'
            ? parsed
            : parsed.text || parsed.content || parsed.prompt || JSON.stringify(parsed, null, 2);
        } catch {
          throw new Error("Invalid JSON file");
        }
      } else if (fileType === 'txt') {
        extractedText = await file.text();
      } else {
        // PDF or Word files - use hybrid parsing approach
        const useLlamaParse = shouldUseLlamaParse(file, ingestionConfig.parser_preference);

        if (useLlamaParse) {
          try {
            console.log(`Using LlamaParse for ${file.name}...`);
            const parseResult = await parseWithLlamaParse(file, {
              resultType: 'markdown',
              parsingInstruction: 'Extract all text content, preserving structure and formatting. Include tables and lists.',
            });
            extractedText = parseResult.text;
            console.log(`LlamaParse extracted ${extractedText.length} characters`);
          } catch (llamaError) {
            console.warn(`LlamaParse failed, falling back to Gemini:`, llamaError);
            // Fallback to Gemini
            const uploadResult = await uploadToGoogleAndExtract(file, GOOGLE_API_KEY);
            extractedText = uploadResult.text;
            originalFileId = uploadResult.fileId;
          }
        } else {
          // Use Gemini for text extraction
          console.log(`Using Gemini for ${file.name}...`);
          const uploadResult = await uploadToGoogleAndExtract(file, GOOGLE_API_KEY);
          extractedText = uploadResult.text;
          originalFileId = uploadResult.fileId;
        }
      }

      // Clean and validate extracted text
      extractedText = cleanText(extractedText);

      if (!extractedText || extractedText.length < 10) {
        throw new Error("Could not extract meaningful text from document");
      }

      console.log(`Extracted ${extractedText.length} characters from ${file.name}`);

      // Store original text and ingestion config for future re-processing
      const { error: textUpdateError } = await supabase
        .from('documents')
        .update({
          original_extracted_text: extractedText,
          ingestion_config: ingestionConfig,
        })
        .eq('id', documentId);

      if (textUpdateError) {
        console.warn('Failed to store original text (non-fatal):', textUpdateError);
        // Non-fatal - continue with chunking even if text storage fails
      } else {
        console.log('Stored original text for future re-processing');
      }

      // Chunk the text with ingestion config
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
        GOOGLE_API_KEY  // Pass API key for advanced chunking strategies
      );
      console.log(`Created ${chunks.length} chunks using ${ingestionConfig.chunking_strategy} strategy`);

      if (chunks.length === 0) {
        throw new Error("No chunks created from document");
      }

      // Generate embeddings for all chunks (batch)
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddings = await generateEmbeddingsBatch(
        chunks.map(c => c.content),
        GOOGLE_API_KEY
      );
      console.log(`Generated ${embeddings.length} embeddings`);

      // Insert chunks with embeddings
      // pgvector expects the embedding as a string in format '[0.1, 0.2, ...]'
      const chunkRecords = chunks.map((chunk, i) => ({
        document_id: documentId,
        chunk_index: chunk.index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: `[${embeddings[i].embedding.join(',')}]`,
      }));

      // Insert in batches of 50 to avoid payload limits
      for (let i = 0; i < chunkRecords.length; i += 50) {
        const batch = chunkRecords.slice(i, i + 50);
        const { error: chunkError } = await supabase
          .from('document_chunks')
          .insert(batch);

        if (chunkError) {
          console.error(`Failed to insert chunks batch ${i}:`, chunkError);
          throw new Error(`Failed to store document chunks: ${chunkError.message}`);
        }
      }

      console.log(`Inserted ${chunkRecords.length} chunks into database`);

      // Update document status to ready
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: 'ready',
          total_chunks: chunks.length,
          total_characters: extractedText.length,
          original_file_id: originalFileId,
        })
        .eq('id', documentId);

      if (updateError) {
        console.error("Failed to update document status:", updateError);
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`Document ${documentId} ready with ${chunks.length} chunks`);

      return new Response(
        JSON.stringify({
          documentId: documentId,
          displayName: file.name,
          status: 'ready',
          totalChunks: chunks.length,
          totalCharacters: extractedText.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    } catch (processingError) {
      // Update document with error status
      console.error("Processing error:", processingError);

      await supabase
        .from('documents')
        .update({
          status: 'error',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error',
        })
        .eq('id', documentId);

      throw processingError;
    }

  } catch (error) {
    console.error("Upload document error:", error);
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

// Upload file to Google and extract text using Gemini
async function uploadToGoogleAndExtract(
  file: File,
  apiKey: string
): Promise<{ fileId: string; text: string }> {
  // Determine mime type
  let mimeType = file.type;
  if (file.name.endsWith(".docx") && !mimeType) {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (file.name.endsWith(".doc") && !mimeType) {
    mimeType = "application/msword";
  } else if (!mimeType) {
    mimeType = "application/pdf";
  }

  // Step 1: Start resumable upload session
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

  const startResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file.size.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: file.name },
    }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Failed to start upload: ${errorText}`);
  }

  const uploadSessionUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadSessionUrl) {
    throw new Error("No upload session URL returned");
  }

  // Step 2: Upload the file content
  const fileBytes = await file.arrayBuffer();

  const uploadResponse = await fetch(uploadSessionUrl, {
    method: "POST",
    headers: {
      "Content-Length": file.size.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBytes,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Failed to upload file: ${errorText}`);
  }

  const uploadData = await uploadResponse.json();
  const fileName = uploadData.file?.name;

  if (!fileName) {
    throw new Error("No file name returned from upload");
  }

  // Step 3: Wait for file to be processed
  let fileState = uploadData.file?.state || "PROCESSING";
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max for larger files

  while (fileState === "PROCESSING" && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
    );

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      fileState = statusData.state;

      if (fileState === "FAILED") {
        throw new Error("File processing failed");
      }

      if (fileState === "ACTIVE") {
        break;
      }
    }

    attempts++;
  }

  if (fileState !== "ACTIVE") {
    throw new Error("File processing timeout");
  }

  // Step 4: Extract text using Gemini
  const extractResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              file_data: {
                file_uri: `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
                mime_type: mimeType,
              },
            },
            {
              text: "Extract and return the complete text content of this document exactly as written, preserving all structure and formatting. Do not summarize or modify anything. Return only the extracted text.",
            },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
        },
      }),
    }
  );

  if (!extractResponse.ok) {
    const errorText = await extractResponse.text();
    throw new Error(`Text extraction failed: ${errorText}`);
  }

  const extractData = await extractResponse.json();
  const extractedText = extractData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!extractedText) {
    throw new Error("No text extracted from document");
  }

  return {
    fileId: fileName,
    text: extractedText,
  };
}
