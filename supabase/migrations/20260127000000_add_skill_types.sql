-- Migration: Add skill types and generator skill support
-- This enables the Second Brain feature with Skill Creator, Generator Skills, and Tool Connectors

-- =====================================================
-- PART 1: Extend skills table with skill_type support
-- =====================================================

-- Add skill_type column (expert, generator, meta)
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS skill_type text DEFAULT 'expert';
COMMENT ON COLUMN public.skills.skill_type IS 'Type of skill: expert (default RAG expert), generator (produces structured output), meta (creates other skills)';

-- Add output_format for generator skills
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'text';
COMMENT ON COLUMN public.skills.output_format IS 'Output format for generator skills: text, markdown, json';

-- Add parent_skill_id for skills created by Skill Creator meta-skill
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS parent_skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.skills.parent_skill_id IS 'Reference to the skill that created this skill (for Skill Creator tracking)';

-- Add index for skill_type queries
CREATE INDEX IF NOT EXISTS idx_skills_skill_type ON public.skills(skill_type);

-- =====================================================
-- PART 2: Create tool_connectors table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tool_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '🔌',

  -- Connection configuration
  connector_type text NOT NULL DEFAULT 'http', -- 'http', 'webhook'
  base_url text NOT NULL,

  -- Authentication
  auth_type text DEFAULT 'none', -- 'none', 'api_key', 'bearer', 'basic'
  auth_header_name text DEFAULT 'Authorization',
  auth_value text, -- In production, this should be encrypted

  -- HTTP defaults
  default_headers jsonb DEFAULT '{}',
  timeout_ms integer DEFAULT 30000,

  -- Available actions (endpoints this connector exposes)
  actions jsonb DEFAULT '[]',
  -- Action schema:
  -- [{
  --   "id": "string",
  --   "name": "string",
  --   "description": "string",
  --   "method": "GET|POST|PUT|DELETE",
  --   "path": "string",
  --   "parameters": [{"name": "string", "type": "string", "required": boolean, "in": "query|body|header|path"}],
  --   "response_mapping": {"field_name": "json_path"}
  -- }]

  -- State
  is_active boolean DEFAULT true,
  last_tested_at timestamp with time zone,
  last_error text,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for tool_connectors
CREATE INDEX IF NOT EXISTS idx_tool_connectors_user_id ON public.tool_connectors(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_connectors_is_active ON public.tool_connectors(is_active);

-- RLS policies (permissive for now, no auth)
ALTER TABLE public.tool_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tool_connectors"
  ON public.tool_connectors
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- PART 3: Link skills to tool connectors
-- =====================================================

-- Add tool_connector_ids array to skills
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS tool_connector_ids uuid[] DEFAULT '{}';
COMMENT ON COLUMN public.skills.tool_connector_ids IS 'Array of tool connector IDs this skill can use';

-- =====================================================
-- PART 4: Update get_user_skills function to include new fields
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_skills(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  description text,
  category text,
  icon text,
  prompt_content text,
  questions_template jsonb,
  is_active boolean,
  is_default boolean,
  skill_type text,
  output_format text,
  parent_skill_id uuid,
  tool_connector_ids uuid[],
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_global boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    s.user_id,
    s.name,
    s.description,
    s.category,
    s.icon,
    s.prompt_content,
    s.questions_template,
    s.is_active,
    s.is_default,
    s.skill_type,
    s.output_format,
    s.parent_skill_id,
    s.tool_connector_ids,
    s.created_at,
    s.updated_at,
    (s.user_id IS NULL) as is_global
  FROM public.skills s
  WHERE s.is_active = true
    AND (s.user_id IS NULL OR s.user_id = p_user_id)
  ORDER BY s.is_default DESC, s.skill_type, s.category, s.name;
$$;
