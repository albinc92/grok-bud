export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string
          user_id: string
          type: 'image' | 'chat'
          prompt: string
          model: string
          image_url: string | null
          response: string | null
          videos: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'image' | 'chat'
          prompt: string
          model: string
          image_url?: string | null
          response?: string | null
          videos?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'image' | 'chat'
          prompt?: string
          model?: string
          image_url?: string | null
          response?: string | null
          videos?: Json | null
          created_at?: string
        }
      }
      settings: {
        Row: {
          user_id: string
          api_key_encrypted: string | null
          theme: string
          image_model: string
          chat_model: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          api_key_encrypted?: string | null
          theme?: string
          image_model?: string
          chat_model?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          api_key_encrypted?: string | null
          theme?: string
          image_model?: string
          chat_model?: string
          created_at?: string
          updated_at?: string
        }
      }
      usage_stats: {
        Row: {
          user_id: string
          chat_tokens: number
          image_count: number
          video_count: number
          updated_at: string
        }
        Insert: {
          user_id: string
          chat_tokens?: number
          image_count?: number
          video_count?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          chat_tokens?: number
          image_count?: number
          video_count?: number
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
