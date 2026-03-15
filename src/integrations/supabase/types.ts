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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_analyses: {
        Row: {
          agent_type: string
          content: string
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          agent_type: string
          content: string
          created_at?: string
          id?: string
          session_id?: string
          user_id: string
        }
        Update: {
          agent_type?: string
          content?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          asset_type: string
          avg_entry: number
          close_price: number | null
          closed_at: string | null
          created_at: string
          direction: string
          id: string
          name: string
          notes: string | null
          opened_at: string
          pnl: number | null
          quantity: number
          status: string
          stop_loss: number | null
          strategy: string | null
          symbol: string
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          avg_entry: number
          close_price?: number | null
          closed_at?: string | null
          created_at?: string
          direction?: string
          id?: string
          name: string
          notes?: string | null
          opened_at?: string
          pnl?: number | null
          quantity: number
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          symbol: string
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          avg_entry?: number
          close_price?: number | null
          closed_at?: string | null
          created_at?: string
          direction?: string
          id?: string
          name?: string
          notes?: string | null
          opened_at?: string
          pnl?: number | null
          quantity?: number
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          symbol?: string
          take_profit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_signals: {
        Row: {
          agent_analysis: string | null
          asset_type: string
          confidence: number
          created_at: string
          direction: string
          entry_price: number
          id: string
          name: string
          position_size: number | null
          reasoning: string | null
          risk_percent: number | null
          risk_reward: number
          status: string
          stop_loss: number
          strategy: string
          symbol: string
          take_profit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_analysis?: string | null
          asset_type?: string
          confidence?: number
          created_at?: string
          direction?: string
          entry_price: number
          id?: string
          name: string
          position_size?: number | null
          reasoning?: string | null
          risk_percent?: number | null
          risk_reward: number
          status?: string
          stop_loss: number
          strategy: string
          symbol: string
          take_profit: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_analysis?: string | null
          asset_type?: string
          confidence?: number
          created_at?: string
          direction?: string
          entry_price?: number
          id?: string
          name?: string
          position_size?: number | null
          reasoning?: string | null
          risk_percent?: number | null
          risk_reward?: number
          status?: string
          stop_loss?: number
          strategy?: string
          symbol?: string
          take_profit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          binance_api_key: string | null
          binance_api_secret: string | null
          created_at: string
          current_capital: number
          id: string
          initial_capital: number
          max_correlation: number
          max_daily_risk: number
          max_drawdown: number
          max_leverage: number
          max_positions: number
          max_single_asset: number
          max_weekly_risk: number
          min_rr_ratio: number
          risk_per_trade: number
          stop_loss_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          max_correlation?: number
          max_daily_risk?: number
          max_drawdown?: number
          max_leverage?: number
          max_positions?: number
          max_single_asset?: number
          max_weekly_risk?: number
          min_rr_ratio?: number
          risk_per_trade?: number
          stop_loss_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          max_correlation?: number
          max_daily_risk?: number
          max_drawdown?: number
          max_leverage?: number
          max_positions?: number
          max_single_asset?: number
          max_weekly_risk?: number
          min_rr_ratio?: number
          risk_per_trade?: number
          stop_loss_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
