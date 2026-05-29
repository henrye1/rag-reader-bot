create table if not exists public.assessment_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  title text not null default 'Untitled assessment',
  entity text not null default '',
  reporting_date text not null default '',
  document_ids jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  source_assessment jsonb
);

alter table public.assessment_documents enable row level security;

-- Drop existing policy if it exists (matches project convention)
drop policy if exists "Allow all on assessment_documents" on public.assessment_documents;

-- Permissive policy, matching the project's existing no-auth posture.
create policy "Allow all on assessment_documents"
  on public.assessment_documents
  for all using (true) with check (true);
