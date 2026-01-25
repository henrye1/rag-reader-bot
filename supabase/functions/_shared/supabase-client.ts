// Server-side Supabase client for edge functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

// Types for database operations
export interface DocumentRecord {
  id: string;
  name: string;
  file_type: string;
  original_file_id: string | null;
  total_chunks: number;
  total_characters: number;
  status: 'processing' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunkRecord {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  embedding: number[] | null;
  created_at: string;
}

export interface MatchedChunk {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
}
