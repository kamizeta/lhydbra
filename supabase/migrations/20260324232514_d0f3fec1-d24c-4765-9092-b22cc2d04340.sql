
CREATE INDEX IF NOT EXISTS idx_positions_user_status ON positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_user_created ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_journal_user_date ON trade_journal(user_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_cache_symbol ON market_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_opportunity_scores_symbol ON opportunity_scores(symbol, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_features_symbol ON market_features(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_daily_performance_user_date ON daily_performance(user_id, date DESC);
