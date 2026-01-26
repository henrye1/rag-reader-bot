export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Skill type definitions for Second Brain feature
export type SkillType = 'expert' | 'generator' | 'meta'
export type OutputFormat = 'text' | 'markdown' | 'json'

// Tool Action definition for Tool Connectors
export interface ToolAction {
  id: string
  name: string
  description?: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  parameters?: ActionParameter[]
  response_mapping?: Record<string, string>
}

export interface ActionParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  required: boolean
  in: 'query' | 'body' | 'header' | 'path'
  description?: string
  default?: string | number | boolean
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          name: string
          file_type: string
          original_file_id: string | null
          total_chunks: number
          total_characters: number
          status: 'processing' | 'ready' | 'error'
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          file_type: string
          original_file_id?: string | null
          total_chunks?: number
          total_characters?: number
          status?: 'processing' | 'ready' | 'error'
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          file_type?: string
          original_file_id?: string | null
          total_chunks?: number
          total_characters?: number
          status?: 'processing' | 'ready' | 'error'
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          id: string
          document_id: string
          chunk_index: number
          content: string
          token_count: number | null
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          chunk_index: number
          content: string
          token_count?: number | null
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          chunk_index?: number
          content?: string
          token_count?: number | null
          embedding?: number[] | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          }
        ]
      }
      skills: {
        Row: {
          id: string
          user_id: string | null
          name: string
          description: string | null
          category: string
          icon: string
          prompt_content: string
          questions_template: Record<string, unknown>[] | null
          is_active: boolean
          is_default: boolean
          rag_config_id: string | null
          skill_type: SkillType
          output_format: OutputFormat
          parent_skill_id: string | null
          tool_connector_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          description?: string | null
          category?: string
          icon?: string
          prompt_content: string
          questions_template?: Record<string, unknown>[] | null
          is_active?: boolean
          is_default?: boolean
          rag_config_id?: string | null
          skill_type?: SkillType
          output_format?: OutputFormat
          parent_skill_id?: string | null
          tool_connector_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          description?: string | null
          category?: string
          icon?: string
          prompt_content?: string
          questions_template?: Record<string, unknown>[] | null
          is_active?: boolean
          is_default?: boolean
          rag_config_id?: string | null
          skill_type?: SkillType
          output_format?: OutputFormat
          parent_skill_id?: string | null
          tool_connector_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_rag_config_id_fkey"
            columns: ["rag_config_id"]
            isOneToOne: false
            referencedRelation: "rag_configs"
            referencedColumns: ["id"]
          }
        ]
      }
      tool_connectors: {
        Row: {
          id: string
          user_id: string | null
          name: string
          description: string | null
          icon: string
          connector_type: string
          base_url: string
          auth_type: string
          auth_header_name: string
          auth_value: string | null
          default_headers: Record<string, string>
          timeout_ms: number
          actions: ToolAction[]
          is_active: boolean
          last_tested_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          description?: string | null
          icon?: string
          connector_type?: string
          base_url: string
          auth_type?: string
          auth_header_name?: string
          auth_value?: string | null
          default_headers?: Record<string, string>
          timeout_ms?: number
          actions?: ToolAction[]
          is_active?: boolean
          last_tested_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          description?: string | null
          icon?: string
          connector_type?: string
          base_url?: string
          auth_type?: string
          auth_header_name?: string
          auth_value?: string | null
          default_headers?: Record<string, string>
          timeout_ms?: number
          actions?: ToolAction[]
          is_active?: boolean
          last_tested_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rag_configs: {
        Row: {
          id: string
          name: string
          description: string | null
          enable_hyde: boolean
          enable_query_rewrite: boolean
          enable_decomposition: boolean
          enable_verification: boolean
          enable_confidence: boolean
          enable_reasoning: boolean
          top_k: number
          similarity_threshold: number
          is_preset: boolean
          preset_category: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          enable_hyde?: boolean
          enable_query_rewrite?: boolean
          enable_decomposition?: boolean
          enable_verification?: boolean
          enable_confidence?: boolean
          enable_reasoning?: boolean
          top_k?: number
          similarity_threshold?: number
          is_preset?: boolean
          preset_category?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          enable_hyde?: boolean
          enable_query_rewrite?: boolean
          enable_decomposition?: boolean
          enable_verification?: boolean
          enable_confidence?: boolean
          enable_reasoning?: boolean
          top_k?: number
          similarity_threshold?: number
          is_preset?: boolean
          preset_category?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_document_chunks: {
        Args: {
          query_embedding: string
          match_threshold?: number
          match_count?: number
          filter_document_ids?: string[] | null
        }
        Returns: {
          id: string
          document_id: string
          document_name: string
          chunk_index: number
          content: string
          similarity: number
        }[]
      }
      get_user_skills: {
        Args: {
          p_user_id?: string | null
        }
        Returns: {
          id: string
          user_id: string | null
          name: string
          description: string | null
          category: string
          icon: string
          prompt_content: string
          questions_template: Record<string, unknown>[] | null
          is_active: boolean
          is_default: boolean
          created_at: string
          updated_at: string
          is_global: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Helper types for the RAG system
export interface UploadedDocument {
  id: string
  documentId: string
  name: string
  uploadedAt: Date
  status: 'processing' | 'ready' | 'error'
  totalChunks?: number
  totalCharacters?: number
  errorMessage?: string
}

export interface Source {
  documentName: string
  chunkIndex: number
  similarity: number
  preview: string
}

export interface AskQuestionResponse {
  answer: string
  reportHtml?: string | null
  reportData?: Record<string, unknown> | null
  sources: Source[]
  error?: string
}

// Skill/Agent types
export interface Skill {
  id: string
  user_id: string | null
  name: string
  description: string | null
  category: string
  icon: string
  prompt_content: string
  questions_template: Record<string, unknown>[] | null
  is_active: boolean
  is_default: boolean
  rag_config_id: string | null
  skill_type: SkillType
  output_format: OutputFormat
  parent_skill_id: string | null
  tool_connector_ids: string[]
  created_at: string
  updated_at: string
  is_global?: boolean
}

export interface SkillCategory {
  name: string
  skills: Skill[]
}

// Tool Connector types
export interface ToolConnector {
  id: string
  user_id: string | null
  name: string
  description: string | null
  icon: string
  connector_type: string
  base_url: string
  auth_type: 'none' | 'api_key' | 'bearer' | 'basic'
  auth_header_name: string
  auth_value: string | null
  default_headers: Record<string, string>
  timeout_ms: number
  actions: ToolAction[]
  is_active: boolean
  last_tested_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

// Generated Skill response from Skill Creator
export interface GeneratedSkillResponse {
  skill: {
    name: string
    description: string
    category: string
    icon: string
    skill_type: SkillType
    output_format: OutputFormat
    prompt_content: string
  }
  reasoning: string
  suggested_use_cases: string[]
}

// Generator skill structured output
export interface GeneratorOutput {
  displayText: string
  structuredData?: Record<string, unknown>
  outputFormat: OutputFormat
  downloadable?: boolean
}
