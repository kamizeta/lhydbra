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
      allocation_items: {
        Row: {
          adjusted_priority: number | null
          allocated_capital: number | null
          allocation_priority: number | null
          asset_type: string
          confidence_score: number | null
          correlation_penalty: number | null
          created_at: string
          direction: string
          expected_r_multiple: number | null
          explanation: Json | null
          final_weight: number | null
          id: string
          opportunity_score: number | null
          plan_id: string
          position_size: number | null
          priority_rank: number | null
          rejection_reason: string | null
          risk_percent: number | null
          risk_used: number | null
          score_multiplier: number | null
          signal_id: string | null
          status: string
          strategy_family: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          adjusted_priority?: number | null
          allocated_capital?: number | null
          allocation_priority?: number | null
          asset_type?: string
          confidence_score?: number | null
          correlation_penalty?: number | null
          created_at?: string
          direction?: string
          expected_r_multiple?: number | null
          explanation?: Json | null
          final_weight?: number | null
          id?: string
          opportunity_score?: number | null
          plan_id: string
          position_size?: number | null
          priority_rank?: number | null
          rejection_reason?: string | null
          risk_percent?: number | null
          risk_used?: number | null
          score_multiplier?: number | null
          signal_id?: string | null
          status?: string
          strategy_family?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          adjusted_priority?: number | null
          allocated_capital?: number | null
          allocation_priority?: number | null
          asset_type?: string
          confidence_score?: number | null
          correlation_penalty?: number | null
          created_at?: string
          direction?: string
          expected_r_multiple?: number | null
          explanation?: Json | null
          final_weight?: number | null
          id?: string
          opportunity_score?: number | null
          plan_id?: string
          position_size?: number | null
          priority_rank?: number | null
          rejection_reason?: string | null
          risk_percent?: number | null
          risk_used?: number | null
          score_multiplier?: number | null
          signal_id?: string | null
          status?: string
          strategy_family?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "allocation_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_items_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trade_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_plans: {
        Row: {
          allocated_capital: number
          allocations: Json
          constraints_applied: Json | null
          created_at: string
          free_capital: number
          id: string
          risk_budget: Json | null
          status: string
          total_capital: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated_capital?: number
          allocations?: Json
          constraints_applied?: Json | null
          created_at?: string
          free_capital?: number
          id?: string
          risk_budget?: Json | null
          status?: string
          total_capital?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated_capital?: number
          allocations?: Json
          constraints_applied?: Json | null
          created_at?: string
          free_capital?: number
          id?: string
          risk_budget?: Json | null
          status?: string
          total_capital?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          response_time_ms: number | null
          source: string
          symbols_requested: number
          symbols_returned: number
        }
        Insert: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          source: string
          symbols_requested?: number
          symbols_returned?: number
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          source?: string
          symbols_requested?: number
          symbols_returned?: number
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          avg_r_multiple: number | null
          computed_at: string
          created_at: string
          expectancy: number | null
          id: string
          losing_trades: number | null
          max_drawdown: number | null
          period_end: string | null
          period_start: string | null
          profit_factor: number | null
          sharpe_estimate: number | null
          status: string
          strategy_id: string | null
          symbol: string
          timeframe: string
          total_pnl: number | null
          total_trades: number | null
          trade_log: Json | null
          user_id: string
          variant_id: string | null
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          avg_r_multiple?: number | null
          computed_at?: string
          created_at?: string
          expectancy?: number | null
          id?: string
          losing_trades?: number | null
          max_drawdown?: number | null
          period_end?: string | null
          period_start?: string | null
          profit_factor?: number | null
          sharpe_estimate?: number | null
          status?: string
          strategy_id?: string | null
          symbol: string
          timeframe?: string
          total_pnl?: number | null
          total_trades?: number | null
          trade_log?: Json | null
          user_id: string
          variant_id?: string | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          avg_r_multiple?: number | null
          computed_at?: string
          created_at?: string
          expectancy?: number | null
          id?: string
          losing_trades?: number | null
          max_drawdown?: number | null
          period_end?: string | null
          period_start?: string | null
          profit_factor?: number | null
          sharpe_estimate?: number | null
          status?: string
          strategy_id?: string | null
          symbol?: string
          timeframe?: string
          total_pnl?: number | null
          total_trades?: number | null
          trade_log?: Json | null
          user_id?: string
          variant_id?: string | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_results_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "strategy_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_logs: {
        Row: {
          created_at: string
          daily_grade: string | null
          date: string
          goal_progress_pct: number | null
          id: string
          metrics: Json | null
          mistakes: string[] | null
          phase: string
          suggestions: string[] | null
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_grade?: string | null
          date?: string
          goal_progress_pct?: number | null
          id?: string
          metrics?: Json | null
          mistakes?: string[] | null
          phase?: string
          suggestions?: string[] | null
          summary?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_grade?: string | null
          date?: string
          goal_progress_pct?: number | null
          id?: string
          metrics?: Json | null
          mistakes?: string[] | null
          phase?: string
          suggestions?: string[] | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      correlation_matrix: {
        Row: {
          asset_class_a: string
          asset_class_b: string
          computed_at: string
          correlation: number
          id: string
          symbol_a: string
          symbol_b: string
        }
        Insert: {
          asset_class_a?: string
          asset_class_b?: string
          computed_at?: string
          correlation?: number
          id?: string
          symbol_a: string
          symbol_b: string
        }
        Update: {
          asset_class_a?: string
          asset_class_b?: string
          computed_at?: string
          correlation?: number
          id?: string
          symbol_a?: string
          symbol_b?: string
        }
        Relationships: []
      }
      daily_performance: {
        Row: {
          avg_r_multiple: number | null
          created_at: string
          date: string
          ending_capital: number
          id: string
          loss_count: number
          max_drawdown_pct: number | null
          realized_pnl: number
          risk_used_pct: number | null
          starting_capital: number
          trades_closed: number
          trades_opened: number
          unrealized_pnl: number
          user_id: string
          win_count: number
        }
        Insert: {
          avg_r_multiple?: number | null
          created_at?: string
          date: string
          ending_capital?: number
          id?: string
          loss_count?: number
          max_drawdown_pct?: number | null
          realized_pnl?: number
          risk_used_pct?: number | null
          starting_capital?: number
          trades_closed?: number
          trades_opened?: number
          unrealized_pnl?: number
          user_id: string
          win_count?: number
        }
        Update: {
          avg_r_multiple?: number | null
          created_at?: string
          date?: string
          ending_capital?: number
          id?: string
          loss_count?: number
          max_drawdown_pct?: number | null
          realized_pnl?: number
          risk_used_pct?: number | null
          starting_capital?: number
          trades_closed?: number
          trades_opened?: number
          unrealized_pnl?: number
          user_id?: string
          win_count?: number
        }
        Relationships: []
      }
      goal_profiles: {
        Row: {
          automation_level: string
          capital_available: number
          created_at: string
          daily_target: number
          id: string
          is_active: boolean
          monthly_target: number
          required_r_per_day: number
          required_trades_per_day: number
          risk_tolerance: string
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_level?: string
          capital_available?: number
          created_at?: string
          daily_target?: number
          id?: string
          is_active?: boolean
          monthly_target?: number
          required_r_per_day?: number
          required_trades_per_day?: number
          risk_tolerance?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_level?: string
          capital_available?: number
          created_at?: string
          daily_target?: number
          id?: string
          is_active?: boolean
          monthly_target?: number
          required_r_per_day?: number
          required_trades_per_day?: number
          risk_tolerance?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_cache: {
        Row: {
          ask: number | null
          asset_class: string
          bid: number | null
          change_percent: number | null
          change_val: number | null
          expires_at: string
          high_price: number | null
          id: string
          is_market_open: boolean | null
          low_price: number | null
          open_price: number | null
          previous_close: number | null
          price: number
          provider: string
          raw_data: Json | null
          request_count: number | null
          symbol: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          ask?: number | null
          asset_class?: string
          bid?: number | null
          change_percent?: number | null
          change_val?: number | null
          expires_at?: string
          high_price?: number | null
          id?: string
          is_market_open?: boolean | null
          low_price?: number | null
          open_price?: number | null
          previous_close?: number | null
          price: number
          provider?: string
          raw_data?: Json | null
          request_count?: number | null
          symbol: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          ask?: number | null
          asset_class?: string
          bid?: number | null
          change_percent?: number | null
          change_val?: number | null
          expires_at?: string
          high_price?: number | null
          id?: string
          is_market_open?: boolean | null
          low_price?: number | null
          open_price?: number | null
          previous_close?: number | null
          price?: number
          provider?: string
          raw_data?: Json | null
          request_count?: number | null
          symbol?: string
          updated_at?: string
          volume?: number | null
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
      notification_preferences: {
        Row: {
          agents_enabled: boolean
          agents_sound: boolean
          created_at: string
          id: string
          pnl_threshold_enabled: boolean
          pnl_threshold_percent: number
          pnl_threshold_sound: boolean
          regime_change_enabled: boolean
          regime_change_sound: boolean
          risk_alerts_enabled: boolean
          risk_alerts_sound: boolean
          signals_enabled: boolean
          signals_sound: boolean
          sl_tp_enabled: boolean
          sl_tp_sound: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agents_enabled?: boolean
          agents_sound?: boolean
          created_at?: string
          id?: string
          pnl_threshold_enabled?: boolean
          pnl_threshold_percent?: number
          pnl_threshold_sound?: boolean
          regime_change_enabled?: boolean
          regime_change_sound?: boolean
          risk_alerts_enabled?: boolean
          risk_alerts_sound?: boolean
          signals_enabled?: boolean
          signals_sound?: boolean
          sl_tp_enabled?: boolean
          sl_tp_sound?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agents_enabled?: boolean
          agents_sound?: boolean
          created_at?: string
          id?: string
          pnl_threshold_enabled?: boolean
          pnl_threshold_percent?: number
          pnl_threshold_sound?: boolean
          regime_change_enabled?: boolean
          regime_change_sound?: boolean
          risk_alerts_enabled?: boolean
          risk_alerts_sound?: boolean
          signals_enabled?: boolean
          signals_sound?: boolean
          sl_tp_enabled?: boolean
          sl_tp_sound?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          severity?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          severity?: string
          title?: string
          type?: string
          user_id?: string
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
      regime_performance: {
        Row: {
          asset_type: string
          avg_r_multiple: number | null
          expectancy: number | null
          id: string
          market_regime: string
          optimal_weight_modifier: number | null
          profit_factor: number | null
          strategy_family: string
          total_pnl: number | null
          total_trades: number | null
          updated_at: string
          user_id: string
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          asset_type?: string
          avg_r_multiple?: number | null
          expectancy?: number | null
          id?: string
          market_regime: string
          optimal_weight_modifier?: number | null
          profit_factor?: number | null
          strategy_family: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          asset_type?: string
          avg_r_multiple?: number | null
          expectancy?: number | null
          id?: string
          market_regime?: string
          optimal_weight_modifier?: number | null
          profit_factor?: number | null
          strategy_family?: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      score_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string
          id: string
          market_regime: string | null
          metrics: Json | null
          new_weights: Json
          performance_window: number | null
          previous_weights: Json
          reason: string | null
          user_id: string
        }
        Insert: {
          adjustment_type?: string
          created_at?: string
          id?: string
          market_regime?: string | null
          metrics?: Json | null
          new_weights?: Json
          performance_window?: number | null
          previous_weights?: Json
          reason?: string | null
          user_id: string
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          id?: string
          market_regime?: string | null
          metrics?: Json | null
          new_weights?: Json
          performance_window?: number | null
          previous_weights?: Json
          reason?: string | null
          user_id?: string
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
      signal_outcomes: {
        Row: {
          actual_pnl: number | null
          actual_r_multiple: number | null
          created_at: string
          id: string
          market_regime: string | null
          outcome: string | null
          predicted_direction: string | null
          predicted_score: number | null
          resolved_at: string | null
          score_breakdown: Json | null
          signal_id: string | null
          strategy_family: string | null
          symbol: string
          user_id: string
          weight_profile_used: Json | null
        }
        Insert: {
          actual_pnl?: number | null
          actual_r_multiple?: number | null
          created_at?: string
          id?: string
          market_regime?: string | null
          outcome?: string | null
          predicted_direction?: string | null
          predicted_score?: number | null
          resolved_at?: string | null
          score_breakdown?: Json | null
          signal_id?: string | null
          strategy_family?: string | null
          symbol: string
          user_id: string
          weight_profile_used?: Json | null
        }
        Update: {
          actual_pnl?: number | null
          actual_r_multiple?: number | null
          created_at?: string
          id?: string
          market_regime?: string | null
          outcome?: string | null
          predicted_direction?: string | null
          predicted_score?: number | null
          resolved_at?: string | null
          score_breakdown?: Json | null
          signal_id?: string | null
          strategy_family?: string | null
          symbol?: string
          user_id?: string
          weight_profile_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trade_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          asset: string
          asset_class: string
          confidence_score: number
          created_at: string
          direction: string
          entry_price: number
          expected_r_multiple: number
          explanation: Json | null
          id: string
          invalidation_reason: string | null
          market_regime: string | null
          modifiers_applied: Json
          opportunity_score: number
          reasoning: string | null
          score_breakdown: Json
          status: string
          stop_loss: number
          strategy_family: string | null
          strategy_id: string | null
          targets: Json
          updated_at: string
          user_id: string
          weight_profile_used: Json
        }
        Insert: {
          asset: string
          asset_class?: string
          confidence_score?: number
          created_at?: string
          direction?: string
          entry_price: number
          expected_r_multiple?: number
          explanation?: Json | null
          id?: string
          invalidation_reason?: string | null
          market_regime?: string | null
          modifiers_applied?: Json
          opportunity_score?: number
          reasoning?: string | null
          score_breakdown?: Json
          status?: string
          stop_loss: number
          strategy_family?: string | null
          strategy_id?: string | null
          targets?: Json
          updated_at?: string
          user_id: string
          weight_profile_used?: Json
        }
        Update: {
          asset?: string
          asset_class?: string
          confidence_score?: number
          created_at?: string
          direction?: string
          entry_price?: number
          expected_r_multiple?: number
          explanation?: Json | null
          id?: string
          invalidation_reason?: string | null
          market_regime?: string | null
          modifiers_applied?: Json
          opportunity_score?: number
          reasoning?: string | null
          score_breakdown?: Json
          status?: string
          stop_loss?: number
          strategy_family?: string | null
          strategy_id?: string | null
          targets?: Json
          updated_at?: string
          user_id?: string
          weight_profile_used?: Json
        }
        Relationships: [
          {
            foreignKeyName: "signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          created_at: string
          description: string | null
          entry_logic: Json
          exit_logic: Json
          historical_expectancy: number | null
          historical_max_drawdown: number | null
          historical_profit_factor: number | null
          historical_sharpe: number | null
          historical_win_rate: number | null
          id: string
          name: string
          preferred_regime: string[] | null
          risk_model: Json
          status: string
          strategy_family: string
          total_trades: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_logic?: Json
          exit_logic?: Json
          historical_expectancy?: number | null
          historical_max_drawdown?: number | null
          historical_profit_factor?: number | null
          historical_sharpe?: number | null
          historical_win_rate?: number | null
          id?: string
          name: string
          preferred_regime?: string[] | null
          risk_model?: Json
          status?: string
          strategy_family?: string
          total_trades?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_logic?: Json
          exit_logic?: Json
          historical_expectancy?: number | null
          historical_max_drawdown?: number | null
          historical_profit_factor?: number | null
          historical_sharpe?: number | null
          historical_win_rate?: number | null
          id?: string
          name?: string
          preferred_regime?: string[] | null
          risk_model?: Json
          status?: string
          strategy_family?: string
          total_trades?: number | null
          updated_at?: string
          user_id?: string
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
      strategy_templates: {
        Row: {
          created_at: string
          description: string | null
          entry_logic: Json
          exit_logic: Json
          id: string
          is_system: boolean | null
          name: string
          preferred_regime: string[] | null
          risk_model: Json
          strategy_family: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_logic?: Json
          exit_logic?: Json
          id?: string
          is_system?: boolean | null
          name: string
          preferred_regime?: string[] | null
          risk_model?: Json
          strategy_family: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_logic?: Json
          exit_logic?: Json
          id?: string
          is_system?: boolean | null
          name?: string
          preferred_regime?: string[] | null
          risk_model?: Json
          strategy_family?: string
        }
        Relationships: []
      }
      strategy_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          parameters: Json
          status: string
          strategy_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parameters?: Json
          status?: string
          strategy_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parameters?: Json
          status?: string
          strategy_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_variants_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      symbol_mapping: {
        Row: {
          alpaca_symbol: string | null
          asset_class: string
          base_asset: string | null
          created_at: string
          display_name: string
          exchangerate_pair: string | null
          fcs_symbol: string | null
          finnhub_symbol: string | null
          freecrypto_symbol: string | null
          id: string
          internal_symbol: string
          is_active: boolean
          quote_asset: string | null
          twelvedata_symbol: string | null
          yahoo_symbol: string | null
        }
        Insert: {
          alpaca_symbol?: string | null
          asset_class?: string
          base_asset?: string | null
          created_at?: string
          display_name?: string
          exchangerate_pair?: string | null
          fcs_symbol?: string | null
          finnhub_symbol?: string | null
          freecrypto_symbol?: string | null
          id?: string
          internal_symbol: string
          is_active?: boolean
          quote_asset?: string | null
          twelvedata_symbol?: string | null
          yahoo_symbol?: string | null
        }
        Update: {
          alpaca_symbol?: string | null
          asset_class?: string
          base_asset?: string | null
          created_at?: string
          display_name?: string
          exchangerate_pair?: string | null
          fcs_symbol?: string | null
          finnhub_symbol?: string | null
          freecrypto_symbol?: string | null
          id?: string
          internal_symbol?: string
          is_active?: boolean
          quote_asset?: string | null
          twelvedata_symbol?: string | null
          yahoo_symbol?: string | null
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
          auto_execute: boolean
          binance_api_key: string | null
          binance_api_secret: string | null
          consecutive_losses: number
          created_at: string
          current_capital: number
          daily_risk_used: number
          id: string
          initial_capital: number
          last_trade_date: string | null
          loss_cooldown_count: number
          max_correlation: number
          max_daily_risk: number
          max_drawdown: number
          max_leverage: number
          max_positions: number
          max_single_asset: number
          max_trades_per_day: number
          max_weekly_risk: number
          min_rr_ratio: number
          operator_mode: boolean
          risk_per_trade: number
          stop_loss_required: boolean
          trades_today: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_execute?: boolean
          binance_api_key?: string | null
          binance_api_secret?: string | null
          consecutive_losses?: number
          created_at?: string
          current_capital?: number
          daily_risk_used?: number
          id?: string
          initial_capital?: number
          last_trade_date?: string | null
          loss_cooldown_count?: number
          max_correlation?: number
          max_daily_risk?: number
          max_drawdown?: number
          max_leverage?: number
          max_positions?: number
          max_single_asset?: number
          max_trades_per_day?: number
          max_weekly_risk?: number
          min_rr_ratio?: number
          operator_mode?: boolean
          risk_per_trade?: number
          stop_loss_required?: boolean
          trades_today?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_execute?: boolean
          binance_api_key?: string | null
          binance_api_secret?: string | null
          consecutive_losses?: number
          created_at?: string
          current_capital?: number
          daily_risk_used?: number
          id?: string
          initial_capital?: number
          last_trade_date?: string | null
          loss_cooldown_count?: number
          max_correlation?: number
          max_daily_risk?: number
          max_drawdown?: number
          max_leverage?: number
          max_positions?: number
          max_single_asset?: number
          max_trades_per_day?: number
          max_weekly_risk?: number
          min_rr_ratio?: number
          operator_mode?: boolean
          risk_per_trade?: number
          stop_loss_required?: boolean
          trades_today?: number
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
      increment_trade_counters: {
        Args: {
          p_max_risk: number
          p_max_trades: number
          p_risk_pct: number
          p_today: string
          p_trade_count: number
          p_user_id: string
        }
        Returns: {
          new_daily_risk_used: number
          new_trades_today: number
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
