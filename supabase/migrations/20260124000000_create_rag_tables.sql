-- Enable pgvector extension in public schema so vector type is accessible
create extension if not exists vector;

-- Create documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_type text not null,
  original_file_id text,
  total_chunks integer default 0,
  total_characters integer default 0,
  status text default 'processing',
  error_message text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create document_chunks table with embeddings (768 dims for Gemini text-embedding-004)
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  embedding vector(768),
  created_at timestamp with time zone default now()
);

-- Create indexes
create index if not exists idx_chunks_document_id on public.document_chunks(document_id);

-- Create similarity search function
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 10,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  chunk_index integer,
  content text,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    d.name as document_name,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on dc.document_id = d.id
  where d.status = 'ready'
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RLS policies
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow all on documents" on public.documents;
drop policy if exists "Allow all on chunks" on public.document_chunks;

-- Create policies
create policy "Allow all on documents" on public.documents for all using (true) with check (true);
create policy "Allow all on chunks" on public.document_chunks for all using (true) with check (true);
