import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateQueryEmbedding } from "../_shared/embeddings.ts";
import { getSupabaseClient, MatchedChunk } from "../_shared/supabase-client.ts";
import {
  detectPII,
  redactPII,
  prepareForAPICall,
  createAuditEntry,
  type PIIDetectionResult,
  type RedactionOptions,
} from "../_shared/popia-compliance.ts";
import {
  generateHypotheticalAnswer,
  rewriteQuery,
  decomposeQuestion,
  verifyAnswer,
  assessConfidence,
  isComplexQuestion,
  REASONING_PROMPT,
  RagConfig,
  DEFAULT_RAG_CONFIG,
  // Retrieval skills
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
  RetrievalChunk,
  rerankChunks,
  keywordSearch,
  fusionRRF,
  fusionWeighted,
  selfRAG,
  correctiveRAG,
  expandToParentChunks,
} from "./rag-skills.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RagSettings {
  topK?: number;
  threshold?: number;
}

// POPIA compliance config from request
interface POPIAConfig {
  enablePIIDetection?: boolean;
  enableAutoRedaction?: boolean;
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactIDNumbers?: boolean;
  redactCreditCards?: boolean;
  showComplianceIndicators?: boolean;
  logAPIRequests?: boolean;
}

// Extended RAG config from request
interface RequestRagConfig {
  enable_hyde?: boolean;
  enable_query_rewrite?: boolean;
  enable_decomposition?: boolean;
  enable_verification?: boolean;
  enable_confidence?: boolean;
  enable_reasoning?: boolean;
  top_k?: number;
  similarity_threshold?: number;
}

// Retrieval config from request
interface RequestRetrievalConfig {
  // Full document mode
  enable_full_document_mode?: boolean;
  full_document_max_chars?: number;
  // Reranking
  enable_reranking?: boolean;
  reranker_model?: 'none' | 'cross-encoder' | 'llm-rerank';
  rerank_top_n?: number;
  enable_fusion?: boolean;
  fusion_strategy?: 'rrf' | 'weighted' | 'linear';
  fusion_weights?: { semantic: number; keyword: number };
  enable_hierarchical?: boolean;
  expand_to_parent?: boolean;
  max_hierarchy_depth?: number;
  enable_self_rag?: boolean;
  max_self_rag_iterations?: number;
  self_rag_threshold?: number;
  enable_crag?: boolean;
  crag_relevance_threshold?: number;
  enable_web_fallback?: boolean;
  enable_feedback_loop?: boolean;
  feedback_learning_rate?: number;
}

// Output format config from request
type OutputStyle = 'narrative' | 'structured' | 'tabular' | 'audit';
type CitationFormat = 'inline' | 'detailed' | 'footnote';
type DetailLevel = 'concise' | 'standard' | 'comprehensive';

interface OutputFormatConfig {
  output_style?: OutputStyle;
  include_executive_summary?: boolean;
  include_per_document_analysis?: boolean;
  include_cross_references?: boolean;
  extract_tables?: boolean;
  extract_statistics?: boolean;
  extract_model_parameters?: boolean;
  citation_format?: CitationFormat;
  include_page_numbers?: boolean;
  include_section_references?: boolean;
  response_detail_level?: DetailLevel;
}

const DEFAULT_OUTPUT_FORMAT: OutputFormatConfig = {
  output_style: 'structured',
  include_executive_summary: true,
  include_per_document_analysis: true,
  include_cross_references: false,
  extract_tables: false,
  extract_statistics: false,
  extract_model_parameters: false,
  citation_format: 'inline',
  include_page_numbers: true,
  include_section_references: false,
  response_detail_level: 'standard',
};

// Generate formatting instructions based on output format config
function buildOutputFormatInstructions(config: OutputFormatConfig): string {
  const instructions: string[] = [];

  // Output style instructions
  switch (config.output_style) {
    case 'narrative':
      instructions.push(`## OUTPUT STYLE: Narrative
- Write in flowing prose with natural paragraph transitions
- Avoid excessive bullet points - prefer complete sentences
- Integrate citations smoothly into the text`);
      break;
    case 'structured':
      instructions.push(`## OUTPUT STYLE: Structured
- Use clear section headers and subheaders
- Use bullet points for lists of findings
- Organize by topic or document source
- Use bold text for key terms and findings`);
      break;
    case 'tabular':
      instructions.push(`## OUTPUT STYLE: Tabular
- Present findings in well-formatted tables where appropriate
- Use markdown tables: | Header 1 | Header 2 |
- Include summary tables for comparisons
- Use bullet points for non-tabular content`);
      break;
    case 'audit':
      instructions.push(`## OUTPUT STYLE: Audit-Quality Professional Format
- Structure response as a formal assessment document
- Begin with an EXECUTIVE SUMMARY section containing:
  - Key findings summary
  - Critical metrics or indicators
  - High-level conclusions
- Follow with DETAILED ANALYSIS section containing:
  - Document-by-document breakdown
  - Extracted data tables with model parameters, coefficients, statistics
  - Cross-references between documents
- Include METHODOLOGY section if relevant
- End with CONCLUSIONS and RECOMMENDATIONS
- Use formal, third-person professional tone
- Format all numerical data in properly aligned tables`);
      break;
  }

  // Detail level instructions
  switch (config.response_detail_level) {
    case 'concise':
      instructions.push(`## RESPONSE LENGTH: Concise
- Provide brief, focused answers (2-4 paragraphs max)
- Focus only on the most relevant information
- Omit lengthy explanations - be direct`);
      break;
    case 'standard':
      instructions.push(`## RESPONSE LENGTH: Standard
- Provide balanced, thorough responses
- Include relevant context and explanation
- Cover key points without excessive detail`);
      break;
    case 'comprehensive':
      instructions.push(`## RESPONSE LENGTH: Comprehensive
- Provide detailed, exhaustive analysis
- Cover all relevant aspects found in the documents
- Include background context and nuanced explanations
- Do not abbreviate or summarize unnecessarily
- Extract and present ALL relevant data, tables, and statistics`);
      break;
  }

  // Citation format instructions
  switch (config.citation_format) {
    case 'inline':
      instructions.push(`## CITATION FORMAT: Inline Brief
- Use brief inline citations: [Source: Document Name]
- Place citations at the end of relevant statements`);
      break;
    case 'detailed':
      instructions.push(`## CITATION FORMAT: Detailed with Location
- Use detailed citations: [Source: Document Name, Section: X, Page: Y, Chunk: Z]
- Include section/page references where available
- Quote exact text in quotation marks when appropriate
- Example: "The model uses a 12-month PD horizon" [Source: IFRS9 Model.pdf, Section: Methodology, Chunk: 5]`);
      break;
    case 'footnote':
      instructions.push(`## CITATION FORMAT: Footnote Style
- Number citations sequentially: [1], [2], etc.
- Include a REFERENCES section at the end listing all sources
- Format: [1] Document Name - Section X - Summary of content`);
      break;
  }

  // Structure options
  const structureOptions: string[] = [];
  if (config.include_executive_summary) {
    structureOptions.push('- Begin with an EXECUTIVE SUMMARY section (3-5 bullet points of key findings)');
  }
  if (config.include_per_document_analysis) {
    structureOptions.push('- Provide PER-DOCUMENT ANALYSIS with dedicated sections for each source document');
  }
  if (config.include_cross_references) {
    structureOptions.push('- Include CROSS-REFERENCES section showing how documents relate to each other');
  }
  if (structureOptions.length > 0) {
    instructions.push(`## STRUCTURE REQUIREMENTS:\n${structureOptions.join('\n')}`);
  }

  // Data extraction options
  const extractionOptions: string[] = [];
  if (config.extract_tables) {
    extractionOptions.push('- EXTRACT and reproduce all tables found in the documents in markdown format');
  }
  if (config.extract_statistics) {
    extractionOptions.push('- EXTRACT all statistical measures (R², p-values, AUC, Gini, accuracy metrics, etc.)');
    extractionOptions.push('- Present statistics in a dedicated STATISTICAL SUMMARY table');
  }
  if (config.extract_model_parameters) {
    extractionOptions.push('- EXTRACT all model parameters, coefficients, weights, and thresholds');
    extractionOptions.push('- Present in a MODEL PARAMETERS table with columns: Parameter | Value | Description');
  }
  if (extractionOptions.length > 0) {
    instructions.push(`## DATA EXTRACTION REQUIREMENTS:\n${extractionOptions.join('\n')}`);
  }

  // Page/section reference options
  if (config.include_page_numbers || config.include_section_references) {
    const refOptions: string[] = [];
    if (config.include_page_numbers) {
      refOptions.push('- Include page numbers in citations where available');
    }
    if (config.include_section_references) {
      refOptions.push('- Include section/heading references (e.g., "Section 3.2: Methodology")');
    }
    instructions.push(`## REFERENCE DETAIL:\n${refOptions.join('\n')}`);
  }

  return instructions.join('\n\n');
}

interface Source {
  documentName: string;
  chunkIndex: number;
  similarity: number;
  preview: string;
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

    const {
      question,
      documentIds,
      customPrompt,
      questionsTemplate,
      generateReport,
      ragSettings,
      ragConfig: requestRagConfig,
      retrievalConfig: requestRetrievalConfig,
      outputFormat: requestOutputFormat,
      conversationHistory,  // Array of previous messages for context
      researchMode,  // Flag to skip RAG and use general knowledge
      // Second Brain skill type support
      skillType,  // 'expert' | 'generator' | 'meta'
      skillName,  // Name of the skill being used
      skillOutputFormat,  // 'text' | 'markdown' | 'json'
      // POPIA compliance settings
      popiaConfig,  // PII detection and redaction options
    } = await req.json();

    // Research mode doesn't require documents
    if (!question) {
      throw new Error("Question is required");
    }
    if (!researchMode && (!documentIds || documentIds.length === 0)) {
      throw new Error("Document IDs are required (or use research mode)");
    }

    // Merge RAG config with defaults
    const ragConfig: RagConfig = {
      ...DEFAULT_RAG_CONFIG,
      ...(requestRagConfig || {}),
    };

    // Merge Retrieval config with defaults
    const retrievalConfig: RetrievalConfig = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      ...(requestRetrievalConfig || {}),
    };

    // Merge Output format with defaults
    const outputFormat: OutputFormatConfig = {
      ...DEFAULT_OUTPUT_FORMAT,
      ...(requestOutputFormat || {}),
    };

    // POPIA compliance configuration
    const popia: POPIAConfig = {
      enablePIIDetection: true,
      enableAutoRedaction: false,
      redactEmails: true,
      redactPhones: true,
      redactIDNumbers: true,
      redactCreditCards: true,
      showComplianceIndicators: true,
      logAPIRequests: true,
      ...(popiaConfig || {}),
    };

    // Track compliance info for response
    let complianceInfo: {
      piiDetected: boolean;
      redactionApplied: boolean;
      riskLevel: 'none' | 'low' | 'medium' | 'high';
      detectedTypes: string[];
      auditLog?: string;
    } = {
      piiDetected: false,
      redactionApplied: false,
      riskLevel: 'none',
      detectedTypes: [],
    };

    // Support legacy ragSettings format
    const topK = requestRagConfig?.top_k || ragSettings?.topK || ragConfig.top_k;
    const threshold = requestRagConfig?.similarity_threshold || ragSettings?.threshold || ragConfig.similarity_threshold;

    console.log(`Asking question about ${documentIds?.length || 0} document(s): ${question}`);
    console.log(`Research mode: ${researchMode ? 'YES' : 'NO'}`);
    console.log(`Skill type: ${skillType || 'expert'}, name: ${skillName || 'default'}, output: ${skillOutputFormat || 'text'}`);
    console.log(`Conversation history: ${conversationHistory ? conversationHistory.length + ' messages' : 'none'}`);
    console.log(`RAG settings: topK=${topK}, threshold=${threshold}`);
    console.log(`RAG skills: hyde=${ragConfig.enable_hyde}, rewrite=${ragConfig.enable_query_rewrite}, decomp=${ragConfig.enable_decomposition}, verify=${ragConfig.enable_verification}, conf=${ragConfig.enable_confidence}, reasoning=${ragConfig.enable_reasoning}`);
    console.log(`Retrieval skills: rerank=${retrievalConfig.enable_reranking}, fusion=${retrievalConfig.enable_fusion}, hierarchical=${retrievalConfig.enable_hierarchical}, selfRAG=${retrievalConfig.enable_self_rag}, crag=${retrievalConfig.enable_crag}`);
    console.log(`Output format: style=${outputFormat.output_style}, detail=${outputFormat.response_detail_level}, citations=${outputFormat.citation_format}`);
    console.log(`Generate report: ${generateReport}`);
    console.log(`Custom prompt provided: ${customPrompt ? 'YES' : 'NO'}`);
    console.log(`Questions template provided: ${questionsTemplate ? 'YES (' + questionsTemplate.length + ' questions)' : 'NO'}`);

    // Track skills applied for response metadata
    const skillsApplied: string[] = [];
    const startTime = Date.now();

    // =====================================================
    // RESEARCH MODE - Direct LLM query without RAG
    // =====================================================
    if (researchMode) {
      console.log("Research Mode: Bypassing RAG, querying general knowledge");
      skillsApplied.push('Research Mode');

      // Build research prompt
      let researchPrompt = customPrompt || `You are a Research Assistant specializing in statistical methods, machine learning, and quantitative analysis.

Your role is to help the user explore and understand:
- Statistical methodologies (regression, time series, classification, etc.)
- Machine learning techniques and their applications
- Model validation and performance metrics
- Industry best practices and standards
- Alternative approaches and challenger models

IMPORTANT GUIDELINES:
1. Provide objective, educational responses about methodologies and techniques
2. When discussing alternatives, explain pros/cons and when each approach is appropriate
3. Reference academic literature and industry standards where relevant
4. Focus on helping the user understand concepts they can apply to their own work
5. If the user describes a methodology, suggest potential challenger approaches or improvements`;

      // Add conversation history for context
      if (conversationHistory && conversationHistory.length > 0) {
        researchPrompt += `\n\n## CONVERSATION HISTORY:\n`;
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            researchPrompt += `USER: ${msg.content}\n\n`;
          } else if (msg.role === 'assistant') {
            const truncatedContent = msg.content.length > 2000
              ? msg.content.substring(0, 2000) + '... [truncated]'
              : msg.content;
            researchPrompt += `ASSISTANT: ${truncatedContent}\n\n`;
          }
        }
        researchPrompt += `---\n\n## CURRENT QUESTION:\n${question}`;
      } else {
        researchPrompt += `\n\n## USER QUESTION:\n${question}`;
      }

      // Make request to Gemini API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      let response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: researchPrompt }] }],
              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 8192,
              },
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Request timeout: The AI model took too long to respond.");
        }
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", response.status, errorText);
        throw new Error(`Gemini API error: ${errorText}`);
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated";
      const processingTimeMs = Date.now() - startTime;

      console.log(`Research Mode completed in ${processingTimeMs}ms`);

      return new Response(
        JSON.stringify({
          answer: answer,
          sources: [],
          skillsApplied: skillsApplied,
          processingTimeMs: processingTimeMs,
          researchMode: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // =====================================================
    // META SKILL HANDLING (e.g., Skill Creator)
    // =====================================================
    if (skillType === 'meta' && skillName === 'Skill Creator') {
      console.log("Meta Skill: Skill Creator - Generating new skill definition");
      skillsApplied.push('Skill Creator (Meta)');

      // For meta skills, we invoke the create-skill function directly
      // The question is treated as the skill description
      const metaPrompt = `You are the Skill Creator. Generate a complete skill definition in JSON format.

The user wants to create a skill for: ${question}

${customPrompt ? `Additional context from the selected skill prompt:\n${customPrompt}\n` : ''}

Generate a JSON response with:
{
  "skill": {
    "name": "Short name",
    "description": "2-3 sentences",
    "category": "Best category",
    "icon": "Emoji",
    "skill_type": "expert",
    "output_format": "text",
    "prompt_content": "Full expert framework"
  },
  "reasoning": "Why you made these choices",
  "suggested_use_cases": ["Use case 1", "Use case 2"]
}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: metaPrompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
              },
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Request timeout: The AI took too long to respond.");
        }
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${errorText}`);
      }

      const data = await response.json();
      const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const processingTimeMs = Date.now() - startTime;

      // Try to parse as JSON for structured response
      let generatedSkill = null;
      try {
        let cleanJson = rawAnswer.trim();
        if (cleanJson.startsWith("```json")) cleanJson = cleanJson.slice(7);
        if (cleanJson.startsWith("```")) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith("```")) cleanJson = cleanJson.slice(0, -3);
        generatedSkill = JSON.parse(cleanJson.trim());
      } catch {
        // If parsing fails, return raw answer
      }

      return new Response(
        JSON.stringify({
          answer: rawAnswer,
          sources: [],
          skillsApplied: skillsApplied,
          processingTimeMs: processingTimeMs,
          skillType: 'meta',
          generatedSkill: generatedSkill,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get document names for reference
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, name')
      .in('id', documentIds);

    if (docsError) {
      console.error("Failed to fetch documents:", docsError);
      throw new Error(`Database error: ${docsError.message}`);
    }

    const documentMap = new Map(documents?.map(d => [d.id, d.name]) || []);
    const documentNames = documents?.map(d => d.name) || [];
    const documentList = documents?.map((d, idx) => `${idx + 1}. ${d.name}`).join('\n') || '';

    // =====================================================
    // FULL DOCUMENT MODE - BYPASS RAG CHUNKING
    // =====================================================

    // Check if full document mode is enabled
    const fullDocumentMode = retrievalConfig.enable_full_document_mode;
    const fullDocumentMaxChars = retrievalConfig.full_document_max_chars || 100000;
    let useFullDocumentMode = false;
    let fullDocumentContext = '';
    let fullDocumentSources: Source[] = [];

    if (fullDocumentMode) {
      console.log(`Full Document Mode enabled (max ${fullDocumentMaxChars} chars)`);

      // Fetch original extracted text from all documents
      const { data: docsWithText, error: textError } = await supabase
        .from('documents')
        .select('id, name, original_extracted_text, total_characters')
        .in('id', documentIds);

      if (textError) {
        console.warn("Failed to fetch document text for full document mode:", textError);
      } else if (docsWithText) {
        // Calculate total text size
        let totalChars = 0;
        const docTexts: { name: string; text: string }[] = [];

        for (const doc of docsWithText) {
          if (doc.original_extracted_text) {
            totalChars += doc.original_extracted_text.length;
            docTexts.push({ name: doc.name, text: doc.original_extracted_text });
          }
        }

        console.log(`Full Document Mode: ${docTexts.length} docs, ${totalChars} total chars`);

        if (totalChars <= fullDocumentMaxChars && docTexts.length > 0) {
          // Use full document mode
          useFullDocumentMode = true;
          skillsApplied.push('Full Document Mode');

          // Build full document context
          fullDocumentContext = docTexts.map((doc, idx) => {
            return `[DOCUMENT ${idx + 1}: ${doc.name}]\n\n${doc.text}`;
          }).join('\n\n' + '='.repeat(80) + '\n\n');

          // Create sources for all documents
          fullDocumentSources = docTexts.map((doc, idx) => ({
            documentName: doc.name,
            chunkIndex: 0,
            similarity: 1.0,
            preview: doc.text.substring(0, 500) + (doc.text.length > 500 ? '...' : ''),
          }));

          console.log(`Full Document Mode ACTIVE: Using complete document text (${totalChars} chars)`);
        } else if (totalChars > fullDocumentMaxChars) {
          console.log(`Full Document Mode: Text exceeds limit (${totalChars} > ${fullDocumentMaxChars}), falling back to RAG`);
        } else {
          console.log(`Full Document Mode: No original text available, falling back to RAG`);
        }
      }
    }

    // Variables for context (will be set by either full doc mode or RAG)
    let contextText = '';
    let sources: Source[] = [];

    // =====================================================
    // RAG SKILLS PIPELINE - PRE-RETRIEVAL
    // (Skipped if Full Document Mode is active)
    // =====================================================

    let processedQuestion = question;
    let wasDecomposed = false;
    let subQuestions: string[] = [];
    let chunks: RetrievalChunk[] = [];

    // Only run RAG pipeline if NOT using full document mode
    if (!useFullDocumentMode) {
      // 1. Query Rewriting - improve vague questions
      if (ragConfig.enable_query_rewrite) {
        console.log("Applying Query Rewrite skill...");
        const rewritten = await rewriteQuery(question, documentNames.join(', '), GOOGLE_API_KEY);
        if (rewritten !== question) {
          processedQuestion = rewritten;
          skillsApplied.push('Query Rewrite');
          console.log(`Query rewritten: "${question}" -> "${processedQuestion}"`);
        }
      }

      // 2. Query Decomposition - break complex questions into sub-questions
      if (ragConfig.enable_decomposition) {
        console.log("Applying Query Decomposition skill...");
        subQuestions = await decomposeQuestion(processedQuestion, GOOGLE_API_KEY);
        if (subQuestions.length > 1) {
          wasDecomposed = true;
          skillsApplied.push('Decomposition');
          console.log(`Question decomposed into ${subQuestions.length} sub-questions`);
        } else {
          subQuestions = [processedQuestion];
        }
      } else {
        subQuestions = [processedQuestion];
      }

      // 3. HyDE - Generate hypothetical answer to guide search (only for single questions)
      let hydeContext = '';
      if (ragConfig.enable_hyde && subQuestions.length === 1) {
        console.log("Applying HyDE skill...");
        hydeContext = await generateHypotheticalAnswer(
          processedQuestion,
          documentNames,
          GOOGLE_API_KEY
        );
        if (hydeContext) {
          skillsApplied.push('HyDE');
          console.log(`HyDE generated ${hydeContext.length} chars of hypothetical context`);
        }
      }

      // Generate query embedding (use processed question + HyDE context if available)
      console.log("Generating query embedding...");
      const embeddingQuery = hydeContext
        ? `${processedQuestion}\n\nContext: ${hydeContext}`
        : processedQuestion;
      const queryEmbedding = await generateQueryEmbedding(embeddingQuery, GOOGLE_API_KEY);

      // =====================================================
      // RETRIEVAL SKILLS PIPELINE
      // =====================================================

      // Helper function for retrieval (used by Self-RAG and CRAG)
      const performRetrieval = async (q: string): Promise<RetrievalChunk[]> => {
        const qEmbed = await generateQueryEmbedding(q, GOOGLE_API_KEY);
        const { data } = await supabase.rpc('match_document_chunks', {
          query_embedding: `[${qEmbed.embedding.join(',')}]`,
          match_threshold: threshold,
          match_count: retrievalConfig.enable_fusion ? topK * 2 : topK,
          filter_document_ids: documentIds,
        });
        return (data || []).map((c: MatchedChunk) => ({
          id: c.id || '',
          document_id: c.document_id,
          document_name: c.document_name,
          chunk_index: c.chunk_index,
          content: c.content,
          similarity: c.similarity,
        }));
      };

      // Search for relevant chunks using vector similarity
      console.log("Searching for relevant chunks...");
      const retrievalTopK = retrievalConfig.enable_fusion ? topK * 2 : topK;
      const { data: matchedChunks, error: searchError } = await supabase
        .rpc('match_document_chunks', {
          query_embedding: `[${queryEmbedding.embedding.join(',')}]`,
          match_threshold: threshold,
          match_count: retrievalTopK,
          filter_document_ids: documentIds,
        });

      if (searchError) {
        console.error("Vector search error:", searchError);
        throw new Error(`Search error: ${searchError.message}`);
      }

      // Convert to RetrievalChunk format
      chunks = (matchedChunks || []).map((c: MatchedChunk) => ({
        id: c.id || '',
        document_id: c.document_id,
        document_name: c.document_name,
        chunk_index: c.chunk_index,
        content: c.content,
        similarity: c.similarity,
      }));
      console.log(`Initial retrieval: ${chunks.length} chunks`);

      // 1. Fusion Retrieval - combine semantic + keyword search
      if (retrievalConfig.enable_fusion && chunks.length > 0) {
        console.log("Applying Fusion Retrieval skill...");
        const keywordResults = keywordSearch(processedQuestion, chunks, topK);

        if (retrievalConfig.fusion_strategy === 'rrf') {
          chunks = fusionRRF(chunks, keywordResults);
        } else {
          chunks = fusionWeighted(chunks, keywordResults, retrievalConfig.fusion_weights);
        }
        skillsApplied.push('Fusion Retrieval');
        console.log(`Fusion: Combined to ${chunks.length} chunks using ${retrievalConfig.fusion_strategy}`);
      }

      // 2. Hierarchical Expansion - expand to parent chunks
      if (retrievalConfig.enable_hierarchical && retrievalConfig.expand_to_parent && chunks.length > 0) {
        console.log("Applying Hierarchical Expansion skill...");
        chunks = await expandToParentChunks(
          chunks,
          retrievalConfig.max_hierarchy_depth,
          supabase
        );
        skillsApplied.push('Hierarchical Expansion');
      }

      // 3. CRAG - Corrective RAG
      if (retrievalConfig.enable_crag && chunks.length > 0) {
        console.log("Applying CRAG skill...");
        const cragResult = await correctiveRAG(
          processedQuestion,
          chunks,
          retrievalConfig.crag_relevance_threshold,
          GOOGLE_API_KEY,
          performRetrieval
        );

        if (cragResult.corrected) {
          chunks = cragResult.chunks;
          skillsApplied.push('CRAG');
          console.log(`CRAG: Action=${cragResult.action}, corrected with ${chunks.length} chunks`);
        }
      }

      // 4. Self-RAG - Iterative refinement
      if (retrievalConfig.enable_self_rag && chunks.length > 0) {
        console.log("Applying Self-RAG skill...");
        const selfRagResult = await selfRAG(
          processedQuestion,
          chunks,
          retrievalConfig.self_rag_threshold,
          retrievalConfig.max_self_rag_iterations,
          GOOGLE_API_KEY,
          performRetrieval
        );

        if (selfRagResult.refined) {
          chunks = selfRagResult.chunks;
          skillsApplied.push('Self-RAG');
          console.log(`Self-RAG: Refined in ${selfRagResult.iterations} iterations, ${chunks.length} chunks`);
        }
      }

      // 5. Reranking - reorder by relevance
      if (retrievalConfig.enable_reranking && retrievalConfig.reranker_model !== 'none' && chunks.length > 0) {
        console.log("Applying Reranking skill...");
        chunks = await rerankChunks(
          processedQuestion,
          chunks,
          retrievalConfig.rerank_top_n,
          GOOGLE_API_KEY
        );
        skillsApplied.push('Reranking');
      }

      // Limit final chunks to topK
      chunks = chunks.slice(0, topK);
      console.log(`Final retrieval: ${chunks.length} chunks after all retrieval skills`);
    } else {
      console.log("Skipping RAG pipeline - Full Document Mode is active");
    }

    // Build context from either full document mode or retrieved chunks
    if (useFullDocumentMode) {
      // Use full document context
      contextText = fullDocumentContext;
      sources = fullDocumentSources;
      console.log(`Using Full Document Mode context: ${contextText.length} chars, ${sources.length} sources`);
    } else if (chunks.length > 0) {
      // Build context from retrieved chunks
      contextText = chunks.map((chunk) => {
        // Use final_score if available (from reranking/fusion), otherwise similarity
        const relevanceScore = chunk.final_score ?? chunk.rerank_score ?? chunk.similarity;

        sources.push({
          documentName: chunk.document_name,
          chunkIndex: chunk.chunk_index,
          similarity: relevanceScore,
          preview: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
        });

        const isParent = chunk.is_parent ? ' [Parent Context]' : '';
        return `[Source: ${chunk.document_name}, Chunk ${chunk.chunk_index + 1}${isParent}, Relevance: ${(relevanceScore * 100).toFixed(1)}%]\n${chunk.content}`;
      }).join('\n\n---\n\n');
    } else {
      // No chunks found - inform the model
      contextText = "No relevant content was found in the uploaded documents for this query.";
    }

    // =====================================================
    // POPIA COMPLIANCE - PII Detection and Redaction
    // =====================================================
    if (popia.enablePIIDetection && contextText && contextText.length > 0) {
      console.log("POPIA: Running PII detection on context...");
      const piiResult = detectPII(contextText);

      complianceInfo.piiDetected = piiResult.hasPII;
      complianceInfo.riskLevel = piiResult.riskLevel;
      complianceInfo.detectedTypes = piiResult.detectedTypes;

      if (piiResult.hasPII) {
        console.log(`POPIA: PII Detected - Risk Level: ${piiResult.riskLevel}`);
        console.log(`POPIA: Types found: ${piiResult.detectedTypes.join(', ')}`);

        if (piiResult.matches.length > 0) {
          for (const match of piiResult.matches) {
            console.log(`POPIA: - ${match.type}: ${match.count} occurrence(s), sample: ${match.sample}`);
          }
        }

        // Apply redaction if enabled
        if (popia.enableAutoRedaction) {
          console.log("POPIA: Applying automatic redaction...");
          contextText = redactPII(contextText, {
            redactEmails: popia.redactEmails,
            redactPhones: popia.redactPhones,
            redactIDNumbers: popia.redactIDNumbers,
            redactCreditCards: popia.redactCreditCards,
          });
          complianceInfo.redactionApplied = true;
          skillsApplied.push('POPIA Redaction');
          console.log("POPIA: Redaction applied to context");
        } else {
          console.log("POPIA: WARNING - PII detected but redaction is disabled");
        }
      } else {
        console.log("POPIA: No PII detected in context");
      }

      // Create audit entry if logging is enabled
      if (popia.logAPIRequests) {
        const auditEntry = createAuditEntry(
          'RAG_QUERY',
          'document_chunks',
          piiResult,
          complianceInfo.redactionApplied,
          contextText.length,
          'Google Gemini API',
          'Document Q&A Analysis',
        );
        complianceInfo.auditLog = JSON.stringify(auditEntry);
        console.log("POPIA: Audit entry created");
      }
    }

    // Build the prompt
    let finalPrompt = '';

    // 4. Multi-Step Reasoning - add reasoning framework for complex questions
    let reasoningPromptAddition = '';
    if (ragConfig.enable_reasoning && isComplexQuestion(processedQuestion)) {
      reasoningPromptAddition = REASONING_PROMPT;
      skillsApplied.push('Multi-Step Reasoning');
      console.log("Complex question detected - adding multi-step reasoning framework");
    }

    // Build explicit instruction about the document context
    const documentsInstruction = useFullDocumentMode
      ? `\n\n## COMPLETE DOCUMENT CONTENT:
You have been provided with the COMPLETE TEXT of ${documentIds.length} document(s). This is the full document content, not chunked excerpts.

**DOCUMENTS PROVIDED:**
${documentList}

**FULL DOCUMENT TEXT:**
${contextText}

**CRITICAL REQUIREMENTS:**
1. Base your response ONLY on the document content above
2. CITE specific documents using the format: [Source: Document Name]
3. Quote exact text from the documents where relevant
4. If the documents don't contain enough information to fully answer the question, state so clearly
5. DO NOT use general knowledge - answer ONLY based on what is in the documents
6. DO NOT hallucinate or fabricate information not present in the documents
7. You have access to the COMPLETE document - provide thorough, detailed analysis\n\n`
      : `\n\n## RETRIEVED DOCUMENT CONTEXT:
You have been provided with ${chunks.length} relevant section(s) from ${documentIds.length} document(s). These sections were retrieved based on semantic similarity to the user's question.

**DOCUMENTS AVAILABLE:**
${documentList}

**RETRIEVED SECTIONS:**
${contextText}

**CRITICAL REQUIREMENTS:**
1. Base your response ONLY on the retrieved sections above
2. CITE specific sources using the format shown: [Source: Document Name, Chunk X]
3. Quote exact text from the retrieved sections where relevant
4. If the retrieved sections don't contain enough information to fully answer the question, state: "The retrieved document sections do not contain complete information for this query"
5. DO NOT use general knowledge - answer ONLY based on what is in the retrieved sections
6. DO NOT hallucinate or fabricate information not present in the sections\n\n`;

    // Build output format instructions
    const outputFormatInstructions = buildOutputFormatInstructions(outputFormat);

    // Default domain specialist prompt
    const defaultPrompt = `You are a domain specialist assistant.

You help the user draft formal, defensible written responses to structured questionnaires and requests for information.

You have access to retrieved sections from organisation-specific documents including:
- Technical frameworks, methodologies, policies, procedures and governance documents
- Supporting quantitative analyses (models, tables, figures, parameter summaries)
- Historical versions of documents

# GENERAL PRINCIPLES

1. Answer each question directly and completely based on the retrieved sections.
   - Restate the question ID and title in your response
   - If the question has bullet points or sub-clauses, respond to each explicitly

2. Base your response on the retrieved document sections.
   - Use ONLY the information from the retrieved sections
   - Reference the source document and chunk number

3. Use citations to supporting documentation.
   - Format: [Source: <Document Name>, Chunk <X>]
   - Only cite content that appears in the retrieved sections

4. Structure and tone.
   - Use a formal, professional tone
   - Recommended structure:
     1. "Response to Question <ID>: <Title>"
     2. Short summary paragraph
     3. Detailed response with sub-headings
     4. Key citations
   - Provide comprehensive, thorough responses with detail from the documents

5. Handling missing information.
   - If specific detail is not in the retrieved sections, state: "This information was not found in the retrieved document sections"
   - Suggest what type of information might be needed

6. No fabrication.
   - Do not invent values, policies, or technical details
   - If you cannot answer from the retrieved sections, say so clearly`;

    // If questions template is provided, use it to structure the response
    if (questionsTemplate && Array.isArray(questionsTemplate) && questionsTemplate.length > 0) {
      finalPrompt = defaultPrompt;

      if (customPrompt) {
        finalPrompt += `\n\n## EXPERT KNOWLEDGE / ASSESSMENT FRAMEWORK:\n${customPrompt}\n\n`;
      }

      finalPrompt += documentsInstruction;

      finalPrompt += `## USER QUESTION/INSTRUCTION:\n${question}\n\n## QUESTIONS TO ANSWER:\n\n`;

      questionsTemplate.forEach((q: { question_id?: string; question?: string; text?: string } | string, index: number) => {
        const questionText = typeof q === 'string' ? q : (q.question || q.text || JSON.stringify(q));
        const questionId = typeof q === 'string' ? String(index + 1) : (q.question_id || String(index + 1));
        finalPrompt += `Question ${index + 1} [${questionId}]: ${questionText}\n\n`;
      });

      finalPrompt += `\n${outputFormatInstructions}\n\n## RESPONSE INSTRUCTIONS:
For EACH question above:
1. Search the retrieved sections for relevant information
2. Provide a COMPLETE, DETAILED response using ONLY information from the retrieved sections
3. Structure your answer according to the OUTPUT FORMAT specified above
4. CITE specific sources using the CITATION FORMAT specified above
5. If information is not in the retrieved sections, state so clearly

**CRITICAL:** Answer ALL questions. Follow the output format. Cite your sources. Never fabricate information.`;

    } else {
      finalPrompt = defaultPrompt;

      if (customPrompt) {
        finalPrompt += `\n\n## EXPERT KNOWLEDGE / ASSESSMENT FRAMEWORK:\n${customPrompt}\n\n`;
      }

      finalPrompt += documentsInstruction;

      finalPrompt += `${outputFormatInstructions}\n\n`;

      // Add conversation history for context continuity
      if (conversationHistory && conversationHistory.length > 0) {
        finalPrompt += `## CONVERSATION HISTORY (for context):\n`;
        finalPrompt += `The user is continuing a conversation. Here is the previous exchange for context:\n\n`;
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            finalPrompt += `USER: ${msg.content}\n\n`;
          } else if (msg.role === 'assistant') {
            // Truncate long assistant responses to save context
            const truncatedContent = msg.content.length > 2000
              ? msg.content.substring(0, 2000) + '... [truncated for brevity]'
              : msg.content;
            finalPrompt += `ASSISTANT: ${truncatedContent}\n\n`;
          }
        }
        finalPrompt += `---\n\n`;
        finalPrompt += `## CURRENT FOLLOW-UP QUESTION:\n${question}\n\n`;
        finalPrompt += `INSTRUCTIONS:
- This is a FOLLOW-UP question in an ongoing conversation
- Build upon and reference the previous responses where relevant
- Provide ADDITIONAL information that complements what was already discussed
- If the user is asking for clarification, provide more detail on that specific topic
- If the user is asking for missing information, focus on that gap
- Use ONLY the information from the retrieved sections
- CITE your sources using the CITATION FORMAT specified above
- Do NOT repeat information already provided unless specifically asked`;
      } else {
        finalPrompt += `## USER QUESTION:\n${question}\n\nINSTRUCTIONS:
- Use ONLY the information from the retrieved sections
- Provide a COMPLETE, DETAILED answer following the OUTPUT FORMAT above
- Structure your response according to the STRUCTURE REQUIREMENTS
- CITE your sources using the CITATION FORMAT specified above
- If information is not in the retrieved sections, state so clearly`;
      }
    }

    if (generateReport) {
      finalPrompt += `\n\n## REPORT GENERATION:
Generate a structured report with:
- Executive Summary with critical findings
- Risk Assessment with indicators
- Detailed findings with structured sections
- Recommendations
- Use professional styling`;
    }

    // Add multi-step reasoning framework if enabled
    if (reasoningPromptAddition) {
      finalPrompt += `\n\n## REASONING FRAMEWORK:${reasoningPromptAddition}`;
    }

    console.log("=== SENDING TO GEMINI ===");
    console.log("Prompt length:", finalPrompt.length, "characters");
    console.log("Context length:", contextText.length, "characters");
    console.log("Number of chunks used:", chunks.length);

    // Make request to Gemini API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout: The AI model took too long to respond.");
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();
    console.log("Gemini response received");

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated";

    // =====================================================
    // RAG SKILLS PIPELINE - POST-RETRIEVAL
    // =====================================================

    // 5. Answer Verification - check for hallucinations
    let verification = null;
    if (ragConfig.enable_verification && answer && answer !== "No answer generated") {
      console.log("Applying Answer Verification skill...");
      verification = await verifyAnswer(
        processedQuestion,
        answer,
        documentNames,
        GOOGLE_API_KEY
      );
      skillsApplied.push('Verification');
      console.log(`Verification: verified=${verification.verified}, severity=${verification.severity}`);
    }

    // 6. Confidence Scoring - assess answer confidence
    let confidence = null;
    if (ragConfig.enable_confidence && answer && answer !== "No answer generated") {
      console.log("Applying Confidence Scoring skill...");
      confidence = await assessConfidence(
        processedQuestion,
        answer,
        documentNames,
        sources.length,
        GOOGLE_API_KEY
      );
      skillsApplied.push('Confidence');
      console.log(`Confidence: ${confidence.score} (${confidence.label})`);
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`RAG pipeline completed in ${processingTimeMs}ms with skills: ${skillsApplied.join(', ') || 'none'}`);

    // Generate HTML report if requested
    let reportHtml = null;
    let reportData = null;

    if (generateReport && answer) {
      const docNames = documents?.map(d => d.name) || [];
      const reportContext = await generateReportContext(answer, question, docNames, customPrompt, GOOGLE_API_KEY);
      reportHtml = generateReportHtml(answer, docNames, reportContext, sources);
      reportData = { answer, documents: docNames, reportContext, sources };
    }

    // Build enhanced response with RAG metadata
    const enhancedResponse = {
      answer: answer,
      reportHtml: reportHtml,
      reportData: reportData,
      sources: sources,
      // RAG Skills metadata
      originalQuestion: question,
      processedQuestion: processedQuestion !== question ? processedQuestion : undefined,
      wasDecomposed: wasDecomposed,
      subQuestions: wasDecomposed ? subQuestions : undefined,
      verification: verification,
      confidence: confidence,
      skillsApplied: skillsApplied,
      processingTimeMs: processingTimeMs,
      // Second Brain skill metadata
      skillType: skillType || 'expert',
      skillOutputFormat: skillOutputFormat || 'text',
      isGeneratorSkill: skillType === 'generator',
      // POPIA compliance metadata
      complianceInfo: popia.showComplianceIndicators ? complianceInfo : undefined,
    };

    return new Response(
      JSON.stringify(enhancedResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Ask question error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

async function generateReportContext(
  answer: string,
  question: string,
  docNames: string[],
  customPrompt: string | null,
  apiKey: string
): Promise<Record<string, unknown>> {
  const contextPrompt = `Based on the following analysis, generate report metadata:

ANALYSIS:
${answer.substring(0, 1500)}

QUESTION:
${question}

CONTEXT:
${customPrompt || 'General document analysis'}

DOCUMENTS: ${docNames.length}

Generate JSON:
{
  "reportTitle": "Short title",
  "reportType": "Analysis type",
  "entityName": "Main subject",
  "reportDescription": "Brief description",
  "keyMetrics": [{"label": "Metric", "value": "Value", "status": "positive/neutral/negative/info"}],
  "summary": "2-3 sentence summary"
}

Respond with ONLY the JSON.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: contextPrompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const contextText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const jsonMatch = contextText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (e) {
    console.error("Error generating report context:", e);
  }

  return {
    reportTitle: "Document Analysis Report",
    reportType: "General Analysis",
    entityName: docNames.length === 1 ? docNames[0] : `${docNames.length} Documents`,
    reportDescription: "Analysis based on retrieved document sections.",
    keyMetrics: [{ label: "Documents Analyzed", value: docNames.length.toString(), status: "info" }],
    summary: "Analysis completed using RAG-based document retrieval."
  };
}

function generateReportHtml(
  answer: string,
  docNames: string[],
  reportContext: Record<string, unknown>,
  sources: Source[]
): string {
  const timestamp = new Date().toISOString().split('T')[0];

  const reportTitle = (reportContext.reportTitle as string) || "Document Analysis Report";
  const entityName = (reportContext.entityName as string) || "Analysis Subject";
  const reportDescription = (reportContext.reportDescription as string) || "Comprehensive document analysis";
  const reportType = (reportContext.reportType as string) || "General Analysis";
  const summary = (reportContext.summary as string) || "Analysis completed successfully.";
  const keyMetrics = (reportContext.keyMetrics as Array<{label: string; value: string; status: string}>) || [];

  let primaryColor = "#2196f3";
  const hasNegative = keyMetrics.some((m) => m.status === "negative");
  const hasPositive = keyMetrics.some((m) => m.status === "positive");

  if (hasNegative) primaryColor = "#ff8c00";
  else if (hasPositive) primaryColor = "#4caf50";

  const statusColors: Record<string, string> = {
    positive: '#4caf50',
    negative: '#ff8c00',
    neutral: '#666',
    info: '#2196f3'
  };

  const metricsHtml = keyMetrics.length > 0 ? `
    <div class="risk-summary">
      ${keyMetrics.map((metric) => `
        <div class="risk-card" style="background: ${statusColors[metric.status] || '#666'};">
          <h3>${metric.label}</h3>
          <div class="value">${metric.value}</div>
        </div>
      `).join('')}
    </div>` : '';

  // Sources section
  const sourcesHtml = sources.length > 0 ? `
    <div class="section">
      <h2>SOURCES USED</h2>
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Section</th>
            <th>Relevance</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          ${sources.map(s => `
            <tr>
              <td>${s.documentName}</td>
              <td>Chunk ${s.chunkIndex + 1}</td>
              <td><span class="badge badge-${s.similarity > 0.7 ? 'low' : s.similarity > 0.5 ? 'medium' : 'high'}">${(s.similarity * 100).toFixed(1)}%</span></td>
              <td>${s.preview}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle} - ${entityName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
    .header { border-bottom: 4px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: ${primaryColor}; font-size: 28px; margin-bottom: 10px; }
    .header .subtitle { color: #666; font-size: 14px; line-height: 1.8; }
    .alert-box { padding: 20px; margin: 20px 0; border-left: 5px solid; border-radius: 4px; }
    .alert-medium { background: #e3f2fd; border-color: #2196f3; }
    .section { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }
    .section h2 { color: #333; font-size: 20px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
    .section h3 { color: #555; font-size: 16px; margin: 15px 0 10px 0; }
    .section p { margin: 10px 0; line-height: 1.8; }
    .section ul { margin: 10px 0 10px 20px; line-height: 2; }
    .section li { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; background: white; font-size: 13px; margin: 15px 0; }
    th { background: #333; color: white; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
    tr:hover { background: #f5f5f5; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    .badge-low { background: #4caf50; color: white; }
    .badge-medium { background: #ffc107; color: black; }
    .badge-high { background: #ff8c00; color: white; }
    .risk-summary { display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap; }
    .risk-card { flex: 1; min-width: 200px; padding: 20px; border-radius: 8px; text-align: center; color: white; }
    .risk-card h3 { font-size: 14px; margin-bottom: 10px; opacity: 0.9; text-transform: uppercase; }
    .risk-card .value { font-size: 32px; font-weight: bold; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px; }
    strong { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${reportTitle.toUpperCase()}</h1>
      <div class="subtitle">
        <strong>Subject:</strong> ${entityName}<br>
        <strong>Analysis Type:</strong> ${reportType}<br>
        <strong>Report Date:</strong> ${timestamp}<br>
        <strong>Documents Analyzed:</strong> ${docNames.length}<br>
        <strong>Sources Retrieved:</strong> ${sources.length}
      </div>
    </div>

    <div class="alert-box alert-medium">
      <h2 style="color: ${primaryColor}; margin-bottom: 10px;">EXECUTIVE SUMMARY</h2>
      <p><strong>Description:</strong> ${reportDescription}</p>
      <p style="margin-top: 10px;"><strong>Key Findings:</strong> ${summary}</p>
    </div>

    ${metricsHtml}

    <div class="section">
      <h2>DETAILED ANALYSIS</h2>
      ${formatAnalysisContent(answer)}
    </div>

    ${sourcesHtml}

    <div class="footer">
      <p><strong>CONFIDENTIAL REPORT</strong></p>
      <p>Generated by: RAG Document Analysis System</p>
      <p>Report ID: RPT-${Date.now()}</p>
    </div>
  </div>
</body>
</html>`;
}

function formatAnalysisContent(answer: string): string {
  let html = answer;

  // Strip citations for clean report output (citations are shown separately in Sources section)
  html = html.replace(/\[Source:\s*[^\]]+\]/gi, '');
  html = html.replace(/\[Chunk\s*\d+[^\]]*\]/gi, '');
  html = html.replace(/\(Source:\s*[^)]+\)/gi, '');
  html = html.replace(/\s{2,}/g, ' ');
  html = html.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Format markdown to HTML
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<h/g, '<h');
  html = html.replace(/<\/h([23])>\s*<\/p>/g, '</h$1>');

  return html;
}
