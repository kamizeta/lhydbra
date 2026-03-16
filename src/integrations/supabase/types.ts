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
      agent_run_results: {
        Row: {
          agent_type: string
          completed_at: string | null
          content: string
          created_at: string
          error_message: string | null
          id: string
          run_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          run_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          run_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_agent: string | null
          error_message: string | null
          id: string
          input_payload: Json
          language: string
          requested_agents: string[]
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_agent?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json
          language?: string
          requested_agents?: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_agent?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json
          language?: string
          requested_agents?: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_features: {
        Row: {
          asset_type: string
          atr_14: number | null
          bollinger_lower: number | null
          bollinger_upper: number | null
          computed_at: string
          ema_12: number | null
          ema_26: number | null
          id: string
          macd: number | null
          macd_histogram: number | null
          macd_signal: number | null
          market_regime: string | null
          momentum_score: number | null
          regime_confidence: number | null
          resistance_level: number | null
          rsi_14: number | null
          sma_20: number | null
          sma_200: number | null
          sma_50: number | null
          support_level: number | null
          symbol: string
          timeframe: string
          trend_direction: string | null
          trend_strength: number | null
          volatility_regime: string | null
        }
        Insert: {
          asset_type?: string
          atr_14?: number | null
          bollinger_lower?: number | null
          bollinger_upper?: number | null
          computed_at?: string
          ema_12?: number | null
          ema_26?: number | null
          id?: string
          macd?: number | null
          macd_histogram?: number | null
          macd_signal?: number | null
          market_regime?: string | null
          momentum_score?: number | null
          regime_confidence?: number | null
          resistance_level?: number | null
          rsi_14?: number | null
          sma_20?: number | null
          sma_200?: number | null
          sma_50?: number | null
          support_level?: number | null
          symbol: string
          timeframe?: string
          trend_direction?: string | null
          trend_strength?: number | null
          volatility_regime?: string | null
        }
        Update: {
          asset_type?: string
          atr_14?: number | null
          bollinger_lower?: number | null
          bollinger_upper?: number | null
          computed_at?: string
          ema_12?: number | null
          ema_26?: number | null
          id?: string
          macd?: number | null
          macd_histogram?: number | null
          macd_signal?: number | null
          market_regime?: string | null
          momentum_score?: number | null
          regime_confidence?: number | null
          resistance_level?: number | null
          rsi_14?: number | null
          sma_20?: number | null
          sma_200?: number | null
          sma_50?: number | null
          support_level?: number | null
          symbol?: string
          timeframe?: string
          trend_direction?: string | null
          trend_strength?: number | null
          volatility_regime?: string | null
        }
        Relationships: []
      }
      ohlcv_cache: {
        Row: {
          asset_type: string
          close: number
          fetched_at: string
          high: number
          id: string
          low: number
          open: number
          source: string
          symbol: string
          timeframe: string
          timestamp: string
          volume: number
        }
        Insert: {
          asset_type?: string
          close: number
          fetched_at?: string
          high: number
          id?: string
          low: number
          open: number
          source?: string
          symbol: string
          timeframe?: string
          timestamp: string
          volume?: number
        }
        Update: {
          asset_type?: string
          close?: number
          fetched_at?: string
          high?: number
          id?: string
          low?: number
          open?: number
          source?: string
          symbol?: string
          timeframe?: string
          timestamp?: string
          volume?: number
        }
        Relationships: []
      }
      opportunity_scores: {
        Row: {
          asset_type: string
          computed_at: string
          direction: string | null
          expires_at: string | null
          historical_score: number | null
          id: string
          macro_score: number | null
          momentum_score: number | null
          rr_score: number | null
          sentiment_score: number | null
          strategy_family: string | null
          strategy_score: number | null
          structure_score: number | null
          symbol: string
          timeframe: string
          total_score: number
          volatility_score: number | null
        }
        Insert: {
          asset_type?: string
          computed_at?: string
          direction?: string | null
          expires_at?: string | null
          historical_score?: number | null
          id?: string
          macro_score?: number | null
          momentum_score?: number | null
          rr_score?: number | null
          sentiment_score?: number | null
          strategy_family?: string | null
          strategy_score?: number | null
          structure_score?: number | null
          symbol: string
          timeframe?: string
          total_score?: number
          volatility_score?: number | null
        }
        Update: {
          asset_type?: string
          computed_at?: string
          direction?: string | null
          expires_at?: string | null
          historical_score?: number | null
          id?: string
          macro_score?: number | null
          momentum_score?: number | null
          rr_score?: number | null
          sentiment_score?: number | null
          strategy_family?: string | null
          strategy_score?: number | null
          structure_score?: number | null
          symbol?: string
          timeframe?: string
          total_score?: number
          volatility_score?: number | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          actual_r_multiple: number | null
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
          regime_at_entry: string | null
          signal_id: string | null
          status: string
          stop_loss: number | null
          strategy: string | null
          strategy_family: string | null
          symbol: string
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_r_multiple?: number | null
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
          regime_at_entry?: string | null
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          strategy_family?: string | null
          symbol: string
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_r_multiple?: number | null
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
          regime_at_entry?: string | null
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          strategy_family?: string | null
          symbol?: string
          take_profit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trade_signals"
            referencedColumns: ["id"]
          },
        ]
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
      regime_changes: {
        Row: {
          asset_type: string
          detected_at: string
          id: string
          new_regime: string
          previous_regime: string
          regime_confidence: number | null
          seen_by_user: boolean
          symbol: string
        }
        Insert: {
          asset_type?: string
          detected_at?: string
          id?: string
          new_regime: string
          previous_regime: string
          regime_confidence?: number | null
          seen_by_user?: boolean
          symbol: string
        }
        Update: {
          asset_type?: string
          detected_at?: string
          id?: string
          new_regime?: string
          previous_regime?: string
          regime_confidence?: number | null
          seen_by_user?: boolean
          symbol?: string
        }
        Relationships: []
      }
      scoring_weights: {
        Row: {
          created_at: string
          historical_weight: number
          id: string
          is_active: boolean
          macro_weight: number
          momentum_weight: number
          name: string
          rr_weight: number
          sentiment_weight: number
          strategy_weight: number
          structure_weight: number
          updated_at: string
          user_id: string
          volatility_weight: number
        }
        Insert: {
          created_at?: string
          historical_weight?: number
          id?: string
          is_active?: boolean
          macro_weight?: number
          momentum_weight?: number
          name?: string
          rr_weight?: number
          sentiment_weight?: number
          strategy_weight?: number
          structure_weight?: number
          updated_at?: string
          user_id: string
          volatility_weight?: number
        }
        Update: {
          created_at?: string
          historical_weight?: number
          id?: string
          is_active?: boolean
          macro_weight?: number
          momentum_weight?: number
          name?: string
          rr_weight?: number
          sentiment_weight?: number
          strategy_weight?: number
          structure_weight?: number
          updated_at?: string
          user_id?: string
          volatility_weight?: number
        }
        Relationships: []
      }
      strategy_performance: {
        Row: {
          avg_r_multiple: number | null
          id: string
          losing_trades: number
          market_regime: string
          max_drawdown: number | null
          sharpe_ratio: number | null
          strategy_family: string
          total_pnl: number | null
          total_trades: number
          updated_at: string
          user_id: string
          win_rate: number | null
          winning_trades: number
        }
        Insert: {
          avg_r_multiple?: number | null
          id?: string
          losing_trades?: number
          market_regime?: string
          max_drawdown?: number | null
          sharpe_ratio?: number | null
          strategy_family: string
          total_pnl?: number | null
          total_trades?: number
          updated_at?: string
          user_id: string
          win_rate?: number | null
          winning_trades?: number
        }
        Update: {
          avg_r_multiple?: number | null
          id?: string
          losing_trades?: number
          market_regime?: string
          max_drawdown?: number | null
          sharpe_ratio?: number | null
          strategy_family?: string
          total_pnl?: number | null
          total_trades?: number
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          winning_trades?: number
        }
        Relationships: []
      }
      trade_journal: {
        Row: {
          asset_type: string
          created_at: string
          direction: string
          entered_at: string
          entry_price: number
          entry_reasoning: string | null
          exit_price: number | null
          exit_reasoning: string | null
          exited_at: string | null
          id: string
          lessons_learned: string | null
          market_regime: string | null
          mistake_tags: string[] | null
          opportunity_score: number | null
          pnl: number | null
          position_id: string | null
          quantity: number
          r_multiple: number | null
          signal_id: string | null
          strategy_family: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          direction?: string
          entered_at?: string
          entry_price: number
          entry_reasoning?: string | null
          exit_price?: number | null
          exit_reasoning?: string | null
          exited_at?: string | null
          id?: string
          lessons_learned?: string | null
          market_regime?: string | null
          mistake_tags?: string[] | null
          opportunity_score?: number | null
          pnl?: number | null
          position_id?: string | null
          quantity: number
          r_multiple?: number | null
          signal_id?: string | null
          strategy_family?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          direction?: string
          entered_at?: string
          entry_price?: number
          entry_reasoning?: string | null
          exit_price?: number | null
          exit_reasoning?: string | null
          exited_at?: string | null
          id?: string
          lessons_learned?: string | null
          market_regime?: string | null
          mistake_tags?: string[] | null
          opportunity_score?: number | null
          pnl?: number | null
          position_id?: string | null
          quantity?: number
          r_multiple?: number | null
          signal_id?: string | null
          strategy_family?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_journal_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_journal_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trade_signals"
            referencedColumns: ["id"]
          },
        ]
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
          market_regime: string | null
          name: string
          opportunity_score: number | null
          position_size: number | null
          reasoning: string | null
          risk_percent: number | null
          risk_reward: number
          score_breakdown: Json | null
          status: string
          stop_loss: number
          strategy: string
          strategy_family: string | null
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
          market_regime?: string | null
          name: string
          opportunity_score?: number | null
          position_size?: number | null
          reasoning?: string | null
          risk_percent?: number | null
          risk_reward: number
          score_breakdown?: Json | null
          status?: string
          stop_loss: number
          strategy: string
          strategy_family?: string | null
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
          market_regime?: string | null
          name?: string
          opportunity_score?: number | null
          position_size?: number | null
          reasoning?: string | null
          risk_percent?: number | null
          risk_reward?: number
          score_breakdown?: Json | null
          status?: string
          stop_loss?: number
          strategy?: string
          strategy_family?: string | null
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
