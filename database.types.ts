export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          created_at: string
          dst_id: string
          id: string
          src_id: string
        }
        Insert: {
          created_at?: string
          dst_id: string
          id?: string
          src_id: string
        }
        Update: {
          created_at?: string
          dst_id?: string
          id?: string
          src_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          user1_ai_enabled: boolean
          user1_chat_enabled: boolean
          user1_id: string
          user1_noti_enabled: boolean
          user2_ai_enabled: boolean
          user2_chat_enabled: boolean
          user2_id: string
          user2_noti_enabled: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          user1_ai_enabled?: boolean
          user1_chat_enabled?: boolean
          user1_id: string
          user1_noti_enabled?: boolean
          user2_ai_enabled?: boolean
          user2_chat_enabled?: boolean
          user2_id: string
          user2_noti_enabled?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          user1_ai_enabled?: boolean
          user1_chat_enabled?: boolean
          user1_id?: string
          user1_noti_enabled?: boolean
          user2_ai_enabled?: boolean
          user2_chat_enabled?: boolean
          user2_id?: string
          user2_noti_enabled?: boolean
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          dst_id: string
          id: string
          src_id: string
        }
        Insert: {
          created_at?: string
          dst_id: string
          id?: string
          src_id: string
        }
        Update: {
          created_at?: string
          dst_id?: string
          id?: string
          src_id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          location: unknown
          updated_at: string
          user_id: string
        }
        Insert: {
          location: unknown
          updated_at?: string
          user_id: string
        }
        Update: {
          location?: unknown
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_human: boolean
          is_read: boolean | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_human: boolean
          is_read?: boolean | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_human?: boolean
          is_read?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          coins: number
          created_at: string
          is_ai_enabled: boolean
          is_banned: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          created_at?: string
          is_ai_enabled?: boolean
          is_banned?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          is_ai_enabled?: boolean
          is_banned?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          dst_id: string
          id: string
          reason: string
          src_id: string
        }
        Insert: {
          created_at?: string
          dst_id: string
          id?: string
          reason: string
          src_id: string
        }
        Update: {
          created_at?: string
          dst_id?: string
          id?: string
          reason?: string
          src_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      select_blocks: {
        Args: never
        Returns: {
          created_at: string
          dst_id: string
          dst_name: string
          id: string
          src_id: string
          src_name: string
        }[]
      }
      select_conversations: {
        Args: never
        Returns: {
          created_at: string
          id: string
          user1_ai_enabled: boolean
          user1_chat_enabled: boolean
          user1_id: string
          user1_name: string
          user1_noti_enabled: boolean
          user2_ai_enabled: boolean
          user2_chat_enabled: boolean
          user2_id: string
          user2_name: string
          user2_noti_enabled: boolean
        }[]
      }
      select_followers: {
        Args: never
        Returns: {
          created_at: string
          dst_id: string
          dst_name: string
          id: string
          src_id: string
          src_name: string
        }[]
      }
      select_followings: {
        Args: never
        Returns: {
          created_at: string
          dst_id: string
          dst_name: string
          id: string
          src_id: string
          src_name: string
        }[]
      }
      select_profile_by_user_id: {
        Args: { uid: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      update_conversations_chat_enabled: {
        Args: { new_chat_enabled: boolean; u1id: string; u2id: string }
        Returns: boolean
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
