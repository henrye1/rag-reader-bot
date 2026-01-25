import type { Source } from './types';

// =====================================================
// DATABASE RECORD TYPES
// =====================================================

// Retrieval configuration stored in database
export interface RetrievalConfigRecord {
  id: string;
  name: string;
  description: string | null;

  // Reranking
  enable_reranking: boolean;
  reranker_model: string;
  rerank_top_n: number;

  // Fusion
  enable_fusion: boolean;
  fusion_strategy: string;
  fusion_weight_semantic: number;
  fusion_weight_keyword: number;

  // Hierarchical
  enable_hierarchical: boolean;
  expand_to_parent: boolean;
  max_hierarchy_depth: number;

  // Self-RAG
  enable_self_rag: boolean;
  max_self_rag_iterations: number;
  self_rag_threshold: number;

  // CRAG
  enable_crag: boolean;
  crag_relevance_threshold: number;
  enable_web_fallback: boolean;

  // Feedback
  enable_feedback_loop: boolean;
  feedback_learning_rate: number;

  // Metadata
  is_preset: boolean;
  preset_category: string | null;
  created_at: string;
  updated_at: string;
}

// Ingestion configuration stored in database
export interface IngestionConfigRecord {
  id: string;
  name: string;
  description: string | null;

  // Chunking
  chunking_strategy: string;
  chunk_size: number;
  chunk_overlap: number;

  // Enhancements
  enable_context_enrichment: boolean;
  enable_metadata_extraction: boolean;
  enable_summary_chunks: boolean;

  // Preservation
  preserve_tables: boolean;
  preserve_lists: boolean;
  extract_entities: boolean;

  // Metadata
  is_preset: boolean;
  preset_category: string | null;
  created_at: string;
  updated_at: string;
}

// Extended document record with new fields
export interface DocumentRecord {
  id: string;
  name: string;
  file_type: string;
  original_file_id: string | null;
  total_chunks: number;
  total_characters: number;
  status: 'processing' | 'ready' | 'error';
  error_message: string | null;
  original_extracted_text: string | null;
  ingestion_config: IngestionConfig | null;
  last_reprocessed_at: string | null;
  created_at: string;
  updated_at: string;
}

// RAG Configuration stored in database
export interface RagConfig {
  id: string;
  name: string;
  description: string | null;

  // RAG skill toggles
  enable_hyde: boolean;
  enable_query_rewrite: boolean;
  enable_decomposition: boolean;
  enable_verification: boolean;
  enable_confidence: boolean;
  enable_reasoning: boolean;

  // Parameters
  top_k: number;
  similarity_threshold: number;

  // Metadata
  is_preset: boolean;
  preset_category: string | null;

  created_at: string;
}

// Default RAG config when none selected
export const DEFAULT_RAG_CONFIG: Omit<RagConfig, 'id' | 'created_at'> = {
  name: 'Default',
  description: 'Standard RAG without enhancements',
  enable_hyde: false,
  enable_query_rewrite: false,
  enable_decomposition: false,
  enable_verification: false,
  enable_confidence: false,
  enable_reasoning: false,
  top_k: 15,
  similarity_threshold: 0.3,
  is_preset: true,
  preset_category: 'General',
};

// Verification result from answer verification skill
export interface VerificationResult {
  verified: boolean;
  issues: string[];
  severity: 'none' | 'minor' | 'major';
  suggestion?: string;
}

// Confidence assessment result
export interface ConfidenceResult {
  score: number;
  label: 'High' | 'Medium' | 'Low';
  reasoning: string;
  gaps: string[];
}

// Enhanced response with RAG metadata
export interface RagEnhancedResponse {
  answer: string;

  // Question processing
  originalQuestion: string;
  processedQuestion?: string;
  wasDecomposed: boolean;
  subQuestions?: string[];

  // RAG skill results
  verification?: VerificationResult;
  confidence?: ConfidenceResult;

  // Metadata
  skillsApplied: string[];
  processingTimeMs?: number;

  // Standard fields
  sources: Source[];
  reportHtml?: string | null;
  reportData?: Record<string, unknown> | null;
}

// Smart Assistant types
export interface AssistantQuestion {
  id: string;
  question: string;
  options: AssistantOption[];
}

export interface AssistantOption {
  id: string;
  label: string;
  description: string;
  value: string;
}

export interface AssistantState {
  step: number;
  documentType: string | null;
  questionComplexity: 'simple' | 'moderate' | 'complex' | null;
  priority: 'speed' | 'balanced' | 'accuracy' | null;
  recommendedConfig: RagConfig | null;
}

// Assistant question flow
export const ASSISTANT_QUESTIONS: AssistantQuestion[] = [
  {
    id: 'documentType',
    question: 'What type of documents are you analyzing?',
    options: [
      { id: 'financial', label: 'Financial', description: 'Financial reports, regulations (IFRS, Basel)', value: 'Financial' },
      { id: 'legal', label: 'Legal', description: 'Contracts, legal documents, policies', value: 'Legal' },
      { id: 'technical', label: 'Technical', description: 'Technical docs, manuals, APIs', value: 'Technical' },
      { id: 'general', label: 'General', description: 'Other document types', value: 'General' },
    ],
  },
  {
    id: 'complexity',
    question: 'What kind of questions will you typically ask?',
    options: [
      { id: 'simple', label: 'Simple Facts', description: 'Finding specific information', value: 'simple' },
      { id: 'moderate', label: 'Comparisons', description: 'Comparing sections, summarizing', value: 'moderate' },
      { id: 'complex', label: 'Complex Analysis', description: 'Multi-part analysis, implications', value: 'complex' },
    ],
  },
  {
    id: 'priority',
    question: "What's more important for your use case?",
    options: [
      { id: 'speed', label: 'Speed', description: 'Quick responses, lower cost', value: 'speed' },
      { id: 'balanced', label: 'Balanced', description: 'Good accuracy with reasonable speed', value: 'balanced' },
      { id: 'accuracy', label: 'Maximum Accuracy', description: 'Best results, more processing time', value: 'accuracy' },
    ],
  },
];

// =====================================================
// INGESTION-TIME CONFIGURATION (Chunking & Processing)
// =====================================================

// Chunking strategy types
export type ChunkingStrategy =
  | 'fixed'           // Fixed size with overlap (default)
  | 'semantic'        // LLM-based semantic boundaries
  | 'proposition'     // Break into atomic propositions
  | 'hierarchical';   // Parent-child relationships

// Parser preference for document extraction
export type ParserPreference = 'auto' | 'llamaparse' | 'gemini';

// Ingestion configuration
export interface IngestionConfig {
  // Chunking settings
  chunking_strategy: ChunkingStrategy;
  chunk_size: number;           // Target size in characters
  chunk_overlap: number;        // Overlap between chunks

  // Enhancement toggles
  enable_context_enrichment: boolean;  // Add surrounding context to chunks
  enable_metadata_extraction: boolean; // Extract titles, sections, etc.
  enable_summary_chunks: boolean;      // Generate summary chunks for sections

  // Processing options
  preserve_tables: boolean;     // Keep table structure
  preserve_lists: boolean;      // Keep list formatting
  extract_entities: boolean;    // Extract named entities

  // Parser selection (for PDF/DOCX files)
  parser_preference: ParserPreference;
}

// Default ingestion config
export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
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

// Ingestion skill descriptions for tooltips
export const INGESTION_SKILL_INFO = {
  fixed: {
    name: 'Fixed Chunking',
    fullName: 'Fixed Size Chunking',
    description: 'Splits text into fixed-size chunks with overlap. Fast and predictable.',
    costMultiplier: 1,
  },
  semantic: {
    name: 'Semantic Chunking',
    fullName: 'Semantic Boundary Chunking',
    description: 'Uses LLM to identify natural semantic boundaries. Better for complex documents.',
    costMultiplier: 2,
  },
  proposition: {
    name: 'Proposition Chunking',
    fullName: 'Proposition-Based Chunking',
    description: 'Breaks text into atomic propositions. Best for fact-dense documents.',
    costMultiplier: 3,
  },
  hierarchical: {
    name: 'Hierarchical Chunking',
    fullName: 'Hierarchical Parent-Child Chunking',
    description: 'Creates parent summaries with detailed child chunks. Best for long documents.',
    costMultiplier: 2.5,
  },
  contextEnrichment: {
    name: 'Context Enrichment',
    fullName: 'Context Window Enrichment',
    description: 'Adds surrounding context to each chunk for better retrieval.',
    costMultiplier: 1.5,
  },
  metadataExtraction: {
    name: 'Metadata Extraction',
    fullName: 'Structural Metadata Extraction',
    description: 'Extracts section titles, headings, and document structure.',
    costMultiplier: 1.2,
  },
  summaryChunks: {
    name: 'Summary Chunks',
    fullName: 'Section Summary Generation',
    description: 'Generates summary chunks for each document section.',
    costMultiplier: 1.5,
  },
};

// Parser preference descriptions for tooltips
export const PARSER_INFO = {
  auto: {
    name: 'Auto',
    fullName: 'Automatic Parser Selection',
    description: 'Uses LlamaParse for PDF/DOCX when available, Gemini as fallback. Best for most use cases.',
  },
  llamaparse: {
    name: 'LlamaParse',
    fullName: 'LlamaParse Document Parser',
    description: 'Specialized document parser. Excellent for complex PDFs with tables, multi-column layouts, and images. Requires API key.',
  },
  gemini: {
    name: 'Gemini',
    fullName: 'Gemini Vision Parser',
    description: 'Uses Gemini multimodal capabilities for text extraction. Good for simple documents and as fallback.',
  },
};

// Ingestion presets
export const INGESTION_PRESETS: Record<string, IngestionConfig> = {
  fast: {
    chunking_strategy: 'fixed',
    chunk_size: 2000,
    chunk_overlap: 100,
    enable_context_enrichment: false,
    enable_metadata_extraction: false,
    enable_summary_chunks: false,
    preserve_tables: true,
    preserve_lists: true,
    extract_entities: false,
    parser_preference: 'gemini',  // Gemini is faster for simple text extraction
  },
  balanced: {
    chunking_strategy: 'fixed',
    chunk_size: 1500,
    chunk_overlap: 200,
    enable_context_enrichment: true,
    enable_metadata_extraction: true,
    enable_summary_chunks: false,
    preserve_tables: true,
    preserve_lists: true,
    extract_entities: false,
    parser_preference: 'auto',  // Let the system decide
  },
  accurate: {
    chunking_strategy: 'semantic',
    chunk_size: 1000,
    chunk_overlap: 150,
    enable_context_enrichment: true,
    enable_metadata_extraction: true,
    enable_summary_chunks: true,
    preserve_tables: true,
    preserve_lists: true,
    extract_entities: true,
    parser_preference: 'llamaparse',  // LlamaParse for best accuracy
  },
  financial: {
    chunking_strategy: 'proposition',
    chunk_size: 800,
    chunk_overlap: 100,
    enable_context_enrichment: true,
    enable_metadata_extraction: true,
    enable_summary_chunks: true,
    preserve_tables: true,
    preserve_lists: true,
    extract_entities: true,
    parser_preference: 'llamaparse',  // LlamaParse handles financial tables well
  },
  legal: {
    chunking_strategy: 'semantic',
    chunk_size: 1200,
    chunk_overlap: 200,
    enable_context_enrichment: true,
    enable_metadata_extraction: true,
    enable_summary_chunks: false,
    preserve_tables: true,
    preserve_lists: true,
    extract_entities: true,
    parser_preference: 'llamaparse',  // LlamaParse handles legal structure well
  },
};

// =====================================================
// QUERY-TIME CONFIGURATION (Existing)
// =====================================================

// Skill descriptions for tooltips
export const RAG_SKILL_INFO = {
  hyde: {
    name: 'HyDE',
    fullName: 'Hypothetical Document Embeddings',
    description: 'Generates a hypothetical answer first to guide document search. Helps with vague questions.',
    apiCalls: 1,
  },
  queryRewrite: {
    name: 'Query Rewrite',
    fullName: 'Query Rewriting',
    description: 'Improves vague or poorly-formed questions to get better search results.',
    apiCalls: 1,
  },
  decomposition: {
    name: 'Decomposition',
    fullName: 'Query Decomposition',
    description: 'Breaks complex multi-part questions into simpler sub-questions.',
    apiCalls: 1,
  },
  verification: {
    name: 'Verification',
    fullName: 'Answer Verification',
    description: 'Checks the answer for hallucinations and unsupported claims.',
    apiCalls: 1,
  },
  confidence: {
    name: 'Confidence',
    fullName: 'Confidence Scoring',
    description: 'Scores how confident the answer is based on document coverage.',
    apiCalls: 1,
  },
  reasoning: {
    name: 'Reasoning',
    fullName: 'Multi-Step Reasoning',
    description: 'Uses chain-of-thought reasoning for complex analytical questions.',
    apiCalls: 0,
  },
};

// =====================================================
// RETRIEVAL-TIME CONFIGURATION (Advanced Retrieval Skills)
// =====================================================

// Reranker model types
export type RerankerModel = 'none' | 'cross-encoder' | 'llm-rerank';

// Fusion retrieval strategy
export type FusionStrategy = 'rrf' | 'weighted' | 'linear';

// Retrieval configuration
export interface RetrievalConfig {
  // Full Document Mode - bypass chunking, send entire document
  enable_full_document_mode: boolean;
  full_document_max_chars: number;  // Max chars before falling back to RAG

  // Reranking - reorder results for relevance
  enable_reranking: boolean;
  reranker_model: RerankerModel;
  rerank_top_n: number;          // How many results to rerank

  // Fusion Retrieval - combine multiple search strategies
  enable_fusion: boolean;
  fusion_strategy: FusionStrategy;
  fusion_weights: {
    semantic: number;            // Weight for vector similarity
    keyword: number;             // Weight for BM25/keyword search
  };

  // Hierarchical Indices - use parent-child chunk relationships
  enable_hierarchical: boolean;
  expand_to_parent: boolean;     // Retrieve parent chunks for context
  max_hierarchy_depth: number;   // How many levels up to expand

  // Self-RAG - iterative self-reflection
  enable_self_rag: boolean;
  max_self_rag_iterations: number;
  self_rag_threshold: number;    // Confidence threshold to trigger iteration

  // CRAG - Corrective RAG
  enable_crag: boolean;
  crag_relevance_threshold: number;  // Below this, trigger correction
  enable_web_fallback: boolean;      // Fall back to web search if docs insufficient

  // Feedback Loop - learn from retrieval quality
  enable_feedback_loop: boolean;
  feedback_learning_rate: number;    // How much to adjust weights
}

// Default retrieval config
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  // Full document mode - disabled by default, use RAG
  enable_full_document_mode: false,
  full_document_max_chars: 100000,  // ~25k tokens, safe for Gemini context

  enable_reranking: false,
  reranker_model: 'none',
  rerank_top_n: 10,

  enable_fusion: false,
  fusion_strategy: 'rrf',
  fusion_weights: {
    semantic: 0.7,
    keyword: 0.3,
  },

  enable_hierarchical: false,
  expand_to_parent: true,
  max_hierarchy_depth: 1,

  enable_self_rag: false,
  max_self_rag_iterations: 2,
  self_rag_threshold: 0.6,

  enable_crag: false,
  crag_relevance_threshold: 0.4,
  enable_web_fallback: false,

  enable_feedback_loop: false,
  feedback_learning_rate: 0.1,
};

// Retrieval skill descriptions for tooltips
export const RETRIEVAL_SKILL_INFO = {
  fullDocument: {
    name: 'Full Document',
    fullName: 'Full Document Mode',
    description: 'Bypasses RAG chunking and sends the entire document to the LLM. Best for smaller documents where full context is needed. Falls back to RAG if documents exceed size limit.',
    apiCalls: 0,
    latencyImpact: 'none',
  },
  reranking: {
    name: 'Reranking',
    fullName: 'Cross-Encoder Reranking',
    description: 'Re-scores retrieved chunks using a more accurate but slower model. Improves relevance ranking.',
    apiCalls: 1,
    latencyImpact: 'medium',
  },
  fusion: {
    name: 'Fusion Retrieval',
    fullName: 'Hybrid Fusion Retrieval',
    description: 'Combines semantic vector search with keyword (BM25) search for better recall.',
    apiCalls: 0,
    latencyImpact: 'low',
  },
  hierarchical: {
    name: 'Hierarchical',
    fullName: 'Hierarchical Index Expansion',
    description: 'Expands retrieved chunks to include parent context. Best with hierarchical chunking.',
    apiCalls: 0,
    latencyImpact: 'low',
  },
  selfRag: {
    name: 'Self-RAG',
    fullName: 'Self-Reflective RAG',
    description: 'Iteratively improves retrieval by reflecting on initial results. Higher accuracy, more API calls.',
    apiCalls: 2,
    latencyImpact: 'high',
  },
  crag: {
    name: 'CRAG',
    fullName: 'Corrective RAG',
    description: 'Detects low-quality retrieval and triggers correction or web fallback.',
    apiCalls: 1,
    latencyImpact: 'medium',
  },
  feedbackLoop: {
    name: 'Feedback Loop',
    fullName: 'Retrieval Feedback Loop',
    description: 'Learns from query success/failure to improve future retrieval. Adapts weights over time.',
    apiCalls: 0,
    latencyImpact: 'none',
  },
};

// Retrieval presets
export const RETRIEVAL_PRESETS: Record<string, RetrievalConfig> = {
  fullDocument: {
    enable_full_document_mode: true,
    full_document_max_chars: 150000,  // Higher limit for full doc mode
    enable_reranking: false,
    reranker_model: 'none',
    rerank_top_n: 10,
    enable_fusion: false,
    fusion_strategy: 'rrf',
    fusion_weights: { semantic: 0.7, keyword: 0.3 },
    enable_hierarchical: false,
    expand_to_parent: true,
    max_hierarchy_depth: 1,
    enable_self_rag: false,
    max_self_rag_iterations: 2,
    self_rag_threshold: 0.6,
    enable_crag: false,
    crag_relevance_threshold: 0.4,
    enable_web_fallback: false,
    enable_feedback_loop: false,
    feedback_learning_rate: 0.1,
  },
  fast: {
    enable_full_document_mode: false,
    full_document_max_chars: 100000,
    enable_reranking: false,
    reranker_model: 'none',
    rerank_top_n: 10,
    enable_fusion: false,
    fusion_strategy: 'rrf',
    fusion_weights: { semantic: 0.7, keyword: 0.3 },
    enable_hierarchical: false,
    expand_to_parent: true,
    max_hierarchy_depth: 1,
    enable_self_rag: false,
    max_self_rag_iterations: 2,
    self_rag_threshold: 0.6,
    enable_crag: false,
    crag_relevance_threshold: 0.4,
    enable_web_fallback: false,
    enable_feedback_loop: false,
    feedback_learning_rate: 0.1,
  },
  balanced: {
    enable_full_document_mode: false,
    full_document_max_chars: 100000,
    enable_reranking: true,
    reranker_model: 'llm-rerank',
    rerank_top_n: 15,
    enable_fusion: true,
    fusion_strategy: 'rrf',
    fusion_weights: { semantic: 0.6, keyword: 0.4 },
    enable_hierarchical: false,
    expand_to_parent: true,
    max_hierarchy_depth: 1,
    enable_self_rag: false,
    max_self_rag_iterations: 2,
    self_rag_threshold: 0.6,
    enable_crag: false,
    crag_relevance_threshold: 0.4,
    enable_web_fallback: false,
    enable_feedback_loop: false,
    feedback_learning_rate: 0.1,
  },
  accurate: {
    enable_full_document_mode: false,
    full_document_max_chars: 100000,
    enable_reranking: true,
    reranker_model: 'llm-rerank',
    rerank_top_n: 20,
    enable_fusion: true,
    fusion_strategy: 'rrf',
    fusion_weights: { semantic: 0.5, keyword: 0.5 },
    enable_hierarchical: true,
    expand_to_parent: true,
    max_hierarchy_depth: 2,
    enable_self_rag: true,
    max_self_rag_iterations: 2,
    self_rag_threshold: 0.5,
    enable_crag: true,
    crag_relevance_threshold: 0.35,
    enable_web_fallback: false,
    enable_feedback_loop: true,
    feedback_learning_rate: 0.1,
  },
  questionnaire: {
    enable_full_document_mode: false,
    full_document_max_chars: 100000,
    enable_reranking: true,
    reranker_model: 'llm-rerank',
    rerank_top_n: 25,
    enable_fusion: true,
    fusion_strategy: 'weighted',
    fusion_weights: { semantic: 0.6, keyword: 0.4 },
    enable_hierarchical: true,
    expand_to_parent: true,
    max_hierarchy_depth: 2,
    enable_self_rag: true,
    max_self_rag_iterations: 3,
    self_rag_threshold: 0.55,
    enable_crag: true,
    crag_relevance_threshold: 0.4,
    enable_web_fallback: false,
    enable_feedback_loop: true,
    feedback_learning_rate: 0.15,
  },
};
