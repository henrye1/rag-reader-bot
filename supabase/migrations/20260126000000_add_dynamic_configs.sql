-- Migration: Add dynamic configuration support
-- Purpose: Enable re-chunking documents without re-upload and persist retrieval configs

-- =============================================================================
-- 1. Extend documents table to store original text and ingestion config
-- =============================================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS original_extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_config JSONB,
  ADD COLUMN IF NOT EXISTS last_reprocessed_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.documents.original_extracted_text IS 'Full extracted text preserved for re-chunking without re-upload';
COMMENT ON COLUMN public.documents.ingestion_config IS 'JSON config used for chunking (strategy, size, overlap, enhancements)';
COMMENT ON COLUMN public.documents.last_reprocessed_at IS 'Timestamp of last re-processing operation';

-- =============================================================================
-- 2. Create retrieval_configs table (following rag_configs pattern)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.retrieval_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Reranking settings
  enable_reranking BOOLEAN DEFAULT FALSE,
  reranker_model TEXT DEFAULT 'none',
  rerank_top_n INTEGER DEFAULT 10,

  -- Fusion retrieval settings
  enable_fusion BOOLEAN DEFAULT FALSE,
  fusion_strategy TEXT DEFAULT 'rrf',
  fusion_weight_semantic FLOAT DEFAULT 0.7,
  fusion_weight_keyword FLOAT DEFAULT 0.3,

  -- Hierarchical retrieval settings
  enable_hierarchical BOOLEAN DEFAULT FALSE,
  expand_to_parent BOOLEAN DEFAULT TRUE,
  max_hierarchy_depth INTEGER DEFAULT 2,

  -- Self-RAG settings
  enable_self_rag BOOLEAN DEFAULT FALSE,
  max_self_rag_iterations INTEGER DEFAULT 3,
  self_rag_threshold FLOAT DEFAULT 0.5,

  -- CRAG settings
  enable_crag BOOLEAN DEFAULT FALSE,
  crag_relevance_threshold FLOAT DEFAULT 0.4,
  enable_web_fallback BOOLEAN DEFAULT FALSE,

  -- Feedback loop settings
  enable_feedback_loop BOOLEAN DEFAULT FALSE,
  feedback_learning_rate FLOAT DEFAULT 0.1,

  -- Metadata
  is_preset BOOLEAN DEFAULT FALSE,
  preset_category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_retrieval_configs_is_preset ON public.retrieval_configs(is_preset);
CREATE INDEX IF NOT EXISTS idx_retrieval_configs_category ON public.retrieval_configs(preset_category);

-- Enable Row Level Security
ALTER TABLE public.retrieval_configs ENABLE ROW LEVEL SECURITY;

-- Create permissive policy (matching other tables in this app)
DROP POLICY IF EXISTS "Allow all on retrieval_configs" ON public.retrieval_configs;
CREATE POLICY "Allow all on retrieval_configs" ON public.retrieval_configs
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- 3. Insert default retrieval config presets (only if table is empty)
-- =============================================================================

DO $$
BEGIN
  -- Only insert presets if none exist
  IF NOT EXISTS (SELECT 1 FROM public.retrieval_configs WHERE is_preset = true LIMIT 1) THEN
    INSERT INTO public.retrieval_configs (
      name, description, is_preset, preset_category,
      enable_reranking, enable_fusion, enable_hierarchical,
      enable_self_rag, enable_crag, enable_feedback_loop
    ) VALUES
      (
        'Default',
        'Standard retrieval without enhancements',
        true, 'General',
        false, false, false, false, false, false
      ),
      (
        'Enhanced',
        'Full retrieval pipeline with reranking and fusion',
        true, 'General',
        true, true, true, true, true, false
      ),
      (
        'Fast',
        'Speed-optimized with minimal processing',
        true, 'General',
        false, false, false, false, false, false
      ),
      (
        'Accurate',
        'Maximum accuracy with all enhancement features',
        true, 'General',
        true, true, true, true, true, true
      );
  END IF;
END $$;

-- =============================================================================
-- 4. Create ingestion_configs table for saved presets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ingestion_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Chunking strategy
  chunking_strategy TEXT DEFAULT 'fixed',
  chunk_size INTEGER DEFAULT 2000,
  chunk_overlap INTEGER DEFAULT 200,

  -- Enhancement options
  enable_context_enrichment BOOLEAN DEFAULT FALSE,
  enable_metadata_extraction BOOLEAN DEFAULT FALSE,
  enable_summary_chunks BOOLEAN DEFAULT FALSE,

  -- Preservation options
  preserve_tables BOOLEAN DEFAULT TRUE,
  preserve_lists BOOLEAN DEFAULT TRUE,
  extract_entities BOOLEAN DEFAULT FALSE,

  -- Metadata
  is_preset BOOLEAN DEFAULT FALSE,
  preset_category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ingestion_configs_is_preset ON public.ingestion_configs(is_preset);

-- Enable RLS
ALTER TABLE public.ingestion_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on ingestion_configs" ON public.ingestion_configs;
CREATE POLICY "Allow all on ingestion_configs" ON public.ingestion_configs
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default ingestion presets (only if table is empty)
DO $$
BEGIN
  -- Only insert presets if none exist
  IF NOT EXISTS (SELECT 1 FROM public.ingestion_configs WHERE is_preset = true LIMIT 1) THEN
    INSERT INTO public.ingestion_configs (
      name, description, is_preset, preset_category,
      chunking_strategy, chunk_size, chunk_overlap,
      enable_context_enrichment, enable_metadata_extraction, enable_summary_chunks
    ) VALUES
      (
        'Fast',
        'Quick processing with fixed chunking',
        true, 'General',
        'fixed', 2000, 200,
        false, false, false
      ),
      (
        'Balanced',
        'Good balance of speed and quality',
        true, 'General',
        'fixed', 1500, 200,
        true, true, false
      ),
      (
        'Accurate',
        'Semantic chunking with all enhancements',
        true, 'General',
        'semantic', 1500, 200,
        true, true, true
      ),
      (
        'Financial',
        'Optimized for financial documents',
        true, 'Financial',
        'proposition', 800, 100,
        true, true, true
      ),
      (
        'Legal',
        'Optimized for legal documents',
        true, 'Legal',
        'semantic', 1200, 150,
        true, true, true
      );
  END IF;
END $$;
