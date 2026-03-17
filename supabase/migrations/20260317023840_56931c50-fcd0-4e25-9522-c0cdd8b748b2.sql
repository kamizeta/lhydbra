
-- ═══════════════════════════════════════════════════
-- LHYDBRA V3: New Database Tables
-- ═══════════════════════════════════════════════════

-- 1. STRATEGY REGISTRY
CREATE TABLE public.strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  strategy_family TEXT NOT NULL DEFAULT 'hybrid',
  description TEXT,
  entry_logic JSONB NOT NULL DEFAULT '{}',
  exit_logic JSONB NOT NULL DEFAULT '{}',
  risk_model JSONB NOT NULL DEFAULT '{}',
  preferred_regime TEXT[] DEFAULT '{}',
  historical_win_rate NUMERIC DEFAULT 0,
  historical_expectancy NUMERIC DEFAULT 0,
  historical_profit_factor NUMERIC DEFAULT 0,
  historical_max_drawdown NUMERIC DEFAULT 0,
  historical_sharpe NUMERIC DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own strategies" ON public.strategies FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategies" ON public.strategies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategies" ON public.strategies FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategies" ON public.strategies FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. STRATEGY TEMPLATES
CREATE TABLE public.strategy_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  strategy_family TEXT NOT NULL,
  description TEXT,
  entry_logic JSONB NOT NULL DEFAULT '{}',
  exit_logic JSONB NOT NULL DEFAULT '{}',
  risk_model JSONB NOT NULL DEFAULT '{}',
  preferred_regime TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read strategy templates" ON public.strategy_templates FOR SELECT TO authenticated USING (true);

-- 3. STRATEGY VARIANTS (for backtesting parameter variations)
CREATE TABLE public.strategy_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own variants" ON public.strategy_variants FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. BACKTEST RESULTS
CREATE TABLE public.backtest_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.strategy_variants(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1d',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  expectancy NUMERIC DEFAULT 0,
  profit_factor NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  sharpe_estimate NUMERIC DEFAULT 0,
  avg_r_multiple NUMERIC DEFAULT 0,
  trade_log JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'completed',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own backtests" ON public.backtest_results FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. SIGNAL OUTCOMES (track actual outcomes of scored signals)
CREATE TABLE public.signal_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal_id UUID REFERENCES public.trade_signals(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  strategy_family TEXT,
  market_regime TEXT,
  predicted_score NUMERIC DEFAULT 0,
  predicted_direction TEXT,
  actual_pnl NUMERIC DEFAULT 0,
  actual_r_multiple NUMERIC DEFAULT 0,
  outcome TEXT DEFAULT 'pending',
  score_breakdown JSONB DEFAULT '{}',
  weight_profile_used JSONB DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own outcomes" ON public.signal_outcomes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. SCORE ADJUSTMENTS (log of adaptive weight changes)
CREATE TABLE public.score_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  adjustment_type TEXT NOT NULL DEFAULT 'auto',
  previous_weights JSONB NOT NULL DEFAULT '{}',
  new_weights JSONB NOT NULL DEFAULT '{}',
  reason TEXT,
  market_regime TEXT,
  performance_window INTEGER DEFAULT 30,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.score_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own adjustments" ON public.score_adjustments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. ALLOCATION PLANS
CREATE TABLE public.allocation_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  total_capital NUMERIC NOT NULL DEFAULT 0,
  allocated_capital NUMERIC NOT NULL DEFAULT 0,
  free_capital NUMERIC NOT NULL DEFAULT 0,
  allocations JSONB NOT NULL DEFAULT '[]',
  risk_budget JSONB DEFAULT '{}',
  constraints_applied JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.allocation_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own allocations" ON public.allocation_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. REGIME PERFORMANCE (cross-tab strategy x regime detailed)
CREATE TABLE public.regime_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_family TEXT NOT NULL,
  market_regime TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'all',
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  avg_r_multiple NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  expectancy NUMERIC DEFAULT 0,
  profit_factor NUMERIC DEFAULT 0,
  optimal_weight_modifier NUMERIC DEFAULT 1.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, strategy_family, market_regime, asset_type)
);

ALTER TABLE public.regime_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own regime perf" ON public.regime_performance FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed strategy templates
INSERT INTO public.strategy_templates (name, strategy_family, description, entry_logic, exit_logic, risk_model, preferred_regime) VALUES
('Trend Following SMA', 'trend_following', 'Buy when SMA20 > SMA50 > SMA200, RSI > 50', '{"indicators": ["sma_20", "sma_50", "sma_200", "rsi_14"], "conditions": ["sma_20 > sma_50", "sma_50 > sma_200", "rsi_14 > 50"]}', '{"conditions": ["sma_20 < sma_50", "rsi_14 < 40"]}', '{"stop_atr_multiplier": 2, "target_r_multiple": 2}', '{trending_bullish,bull_market}'),
('Breakout Bollinger', 'breakout', 'Enter on close above Bollinger Upper with volume confirmation', '{"indicators": ["bollinger_upper", "bollinger_lower", "volume"], "conditions": ["close > bollinger_upper", "volume > avg_volume * 1.5"]}', '{"conditions": ["close < sma_20"]}', '{"stop_atr_multiplier": 1.5, "target_r_multiple": 3}', '{compression,pre_breakout}'),
('Mean Reversion RSI', 'mean_reversion', 'Buy when RSI < 30 in ranging market, sell when RSI > 70', '{"indicators": ["rsi_14", "bollinger_lower"], "conditions": ["rsi_14 < 30", "close < bollinger_lower"]}', '{"conditions": ["rsi_14 > 70", "close > bollinger_upper"]}', '{"stop_atr_multiplier": 1, "target_r_multiple": 1.5}', '{ranging,oversold}'),
('Momentum Rotation', 'momentum_rotation', 'Rotate into assets with strongest momentum score', '{"indicators": ["momentum_score", "rsi_14", "macd"], "conditions": ["momentum_score > 70", "rsi_14 > 50", "macd > macd_signal"]}', '{"conditions": ["momentum_score < 40"]}', '{"stop_atr_multiplier": 2, "target_r_multiple": 2.5}', '{trending_bullish,bull_market}'),
('Liquidity Sweep', 'liquidity_sweep', 'Enter after false breakout below support with quick recovery', '{"indicators": ["support_level", "volume", "rsi_14"], "conditions": ["low < support_level", "close > support_level", "volume_spike"]}', '{"conditions": ["close < support_level"]}', '{"stop_atr_multiplier": 1, "target_r_multiple": 3}', '{ranging,volatile}');
