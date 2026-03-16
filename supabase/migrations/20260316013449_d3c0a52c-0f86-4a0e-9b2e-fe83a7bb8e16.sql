
-- =============================================
-- PHASE 1: Market Data Layer Tables
-- =============================================

-- 1. OHLCV Cache - stores normalized price data from all sources
CREATE TABLE public.ohlcv_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1d',
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT NOT NULL DEFAULT 'hybrid',
  asset_type TEXT NOT NULL DEFAULT 'stock',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, timestamp)
);

-- 2. Market Features - computed features per asset/timeframe
CREATE TABLE public.market_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1d',
  asset_type TEXT NOT NULL DEFAULT 'stock',
  -- Trend indicators
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  sma_200 NUMERIC,
  ema_12 NUMERIC,
  ema_26 NUMERIC,
  -- Momentum
  rsi_14 NUMERIC,
  macd NUMERIC,
  macd_signal NUMERIC,
  macd_histogram NUMERIC,
  momentum_score NUMERIC DEFAULT 50,
  -- Volatility
  atr_14 NUMERIC,
  bollinger_upper NUMERIC,
  bollinger_lower NUMERIC,
  volatility_regime TEXT DEFAULT 'normal',
  -- Market structure
  trend_direction TEXT DEFAULT 'sideways',
  trend_strength NUMERIC DEFAULT 0,
  support_level NUMERIC,
  resistance_level NUMERIC,
  -- Regime classification
  market_regime TEXT DEFAULT 'undefined',
  regime_confidence NUMERIC DEFAULT 0,
  -- Metadata
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe)
);

-- 3. Opportunity Scores - scored opportunities with breakdown
CREATE TABLE public.opportunity_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'stock',
  timeframe TEXT NOT NULL DEFAULT '1d',
  -- Overall score
  total_score NUMERIC NOT NULL DEFAULT 0,
  -- Component scores (0-100 each)
  structure_score NUMERIC DEFAULT 0,
  momentum_score NUMERIC DEFAULT 0,
  volatility_score NUMERIC DEFAULT 0,
  strategy_score NUMERIC DEFAULT 0,
  macro_score NUMERIC DEFAULT 0,
  sentiment_score NUMERIC DEFAULT 0,
  rr_score NUMERIC DEFAULT 0,
  historical_score NUMERIC DEFAULT 0,
  -- Suggested direction
  direction TEXT DEFAULT 'neutral',
  -- Strategy match
  strategy_family TEXT,
  -- Metadata
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(symbol, timeframe)
);

-- 4. Scoring Weights - configurable weights for opportunity scoring
CREATE TABLE public.scoring_weights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  structure_weight NUMERIC NOT NULL DEFAULT 15,
  momentum_weight NUMERIC NOT NULL DEFAULT 15,
  volatility_weight NUMERIC NOT NULL DEFAULT 10,
  strategy_weight NUMERIC NOT NULL DEFAULT 15,
  macro_weight NUMERIC NOT NULL DEFAULT 10,
  sentiment_weight NUMERIC NOT NULL DEFAULT 10,
  rr_weight NUMERIC NOT NULL DEFAULT 15,
  historical_weight NUMERIC NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 5. Strategy Performance - tracks performance by strategy x regime
CREATE TABLE public.strategy_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_family TEXT NOT NULL,
  market_regime TEXT NOT NULL DEFAULT 'all',
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  avg_r_multiple NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  sharpe_ratio NUMERIC DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, strategy_family, market_regime)
);

-- 6. Trade Journal (extended) - detailed trade history with regime/strategy tags
CREATE TABLE public.trade_journal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  signal_id UUID REFERENCES public.trade_signals(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'stock',
  direction TEXT NOT NULL DEFAULT 'long',
  strategy_family TEXT,
  market_regime TEXT,
  -- Entry/Exit
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  quantity NUMERIC NOT NULL,
  -- Results
  pnl NUMERIC,
  r_multiple NUMERIC,
  -- Scores at entry
  opportunity_score NUMERIC,
  -- Notes
  entry_reasoning TEXT,
  exit_reasoning TEXT,
  lessons_learned TEXT,
  mistake_tags TEXT[] DEFAULT '{}',
  -- Timestamps
  entered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new columns to trade_signals
ALTER TABLE public.trade_signals
  ADD COLUMN IF NOT EXISTS opportunity_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_regime TEXT DEFAULT 'undefined',
  ADD COLUMN IF NOT EXISTS strategy_family TEXT,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}';

-- Add new columns to positions
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS regime_at_entry TEXT,
  ADD COLUMN IF NOT EXISTS strategy_family TEXT,
  ADD COLUMN IF NOT EXISTS actual_r_multiple NUMERIC;

-- RLS: ohlcv_cache is public read (market data)
ALTER TABLE public.ohlcv_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ohlcv cache" ON public.ohlcv_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert ohlcv cache" ON public.ohlcv_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service can update ohlcv cache" ON public.ohlcv_cache FOR UPDATE TO authenticated USING (true);

-- RLS: market_features is public read
ALTER TABLE public.market_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read market features" ON public.market_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert market features" ON public.market_features FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service can update market features" ON public.market_features FOR UPDATE TO authenticated USING (true);

-- RLS: opportunity_scores is public read
ALTER TABLE public.opportunity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read opportunity scores" ON public.opportunity_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert opportunity scores" ON public.opportunity_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service can update opportunity scores" ON public.opportunity_scores FOR UPDATE TO authenticated USING (true);

-- RLS: scoring_weights per user
ALTER TABLE public.scoring_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own scoring weights" ON public.scoring_weights FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scoring weights" ON public.scoring_weights FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scoring weights" ON public.scoring_weights FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS: strategy_performance per user
ALTER TABLE public.strategy_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own strategy performance" ON public.strategy_performance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategy performance" ON public.strategy_performance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategy performance" ON public.strategy_performance FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS: trade_journal per user
ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own journal" ON public.trade_journal FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal" ON public.trade_journal FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal" ON public.trade_journal FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal" ON public.trade_journal FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_ohlcv_symbol_timeframe ON public.ohlcv_cache(symbol, timeframe, timestamp DESC);
CREATE INDEX idx_market_features_symbol ON public.market_features(symbol, timeframe);
CREATE INDEX idx_opportunity_scores_symbol ON public.opportunity_scores(symbol, total_score DESC);
CREATE INDEX idx_trade_journal_user ON public.trade_journal(user_id, entered_at DESC);
CREATE INDEX idx_strategy_perf_user ON public.strategy_performance(user_id, strategy_family);
