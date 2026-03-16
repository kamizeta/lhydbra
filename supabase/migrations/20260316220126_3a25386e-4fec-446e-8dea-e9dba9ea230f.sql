
-- Backfill trade_signals with opportunity_score from opportunity_scores table
UPDATE trade_signals ts
SET opportunity_score = os.total_score,
    score_breakdown = jsonb_build_object(
      'structure', os.structure_score,
      'momentum', os.momentum_score,
      'volatility', os.volatility_score,
      'strategy', os.strategy_score,
      'rr', os.rr_score,
      'macro', os.macro_score,
      'sentiment', os.sentiment_score,
      'historical', os.historical_score
    )
FROM opportunity_scores os
WHERE ts.symbol = os.symbol
  AND ts.opportunity_score IS NULL;

-- Backfill trade_journal with opportunity_score from trade_signals
UPDATE trade_journal tj
SET opportunity_score = ts.opportunity_score
FROM trade_signals ts
WHERE tj.signal_id = ts.id
  AND tj.opportunity_score IS NULL
  AND ts.opportunity_score IS NOT NULL;

-- Also backfill journal entries without signal_id using opportunity_scores directly
UPDATE trade_journal tj
SET opportunity_score = os.total_score
FROM opportunity_scores os
WHERE tj.symbol = os.symbol
  AND tj.opportunity_score IS NULL;
