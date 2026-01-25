-- RAG configuration presets table
create table if not exists public.rag_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,

  -- RAG skill toggles
  enable_hyde boolean default false,
  enable_query_rewrite boolean default false,
  enable_decomposition boolean default false,
  enable_verification boolean default false,
  enable_confidence boolean default false,
  enable_reasoning boolean default false,

  -- Parameters
  top_k integer default 15,
  similarity_threshold float default 0.3,

  -- Metadata
  is_preset boolean default false,
  preset_category text,

  created_at timestamp with time zone default now()
);

-- Link skills to RAG configs (optional per-skill override)
alter table public.skills add column if not exists rag_config_id uuid references public.rag_configs(id);

-- Create indexes
create index if not exists idx_rag_configs_is_preset on public.rag_configs(is_preset);
create index if not exists idx_rag_configs_category on public.rag_configs(preset_category);

-- RLS policies
alter table public.rag_configs enable row level security;

drop policy if exists "Allow all on rag_configs" on public.rag_configs;
create policy "Allow all on rag_configs" on public.rag_configs for all using (true) with check (true);

-- Insert default presets
insert into public.rag_configs (name, description, is_preset, preset_category,
  enable_hyde, enable_query_rewrite, enable_decomposition, enable_verification,
  enable_confidence, enable_reasoning, top_k, similarity_threshold)
values
  ('Default', 'Standard RAG without enhancements - fastest option', true, 'General',
   false, false, false, false, false, false, 15, 0.3),
  ('Enhanced', 'Full accuracy suite with all skills enabled', true, 'General',
   true, true, true, true, true, true, 20, 0.35),
  ('Fast', 'Speed optimized - only query rewriting for better search', true, 'General',
   false, true, false, false, false, false, 10, 0.4),
  ('Financial', 'Optimized for financial documents and regulations', true, 'Financial',
   true, true, true, true, true, true, 25, 0.3),
  ('Legal', 'Optimized for legal documents and contracts', true, 'Legal',
   true, true, true, true, true, true, 30, 0.25),
  ('Technical', 'Optimized for technical documentation', true, 'Technical',
   true, true, false, true, true, false, 20, 0.35);
