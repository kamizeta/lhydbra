import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_PROMPTS: Record<string, string> = {
  "market-analyst": `You are an institutional-grade Market Analyst agent for a professional investment platform.

You will receive COMPUTED TECHNICAL INDICATORS (market_features) and OPPORTUNITY SCORES for each asset.

Your job is to analyze this structured data and deliver:
1. **Market Regime** — Based on the market_regime, trend_direction, and regime_confidence fields. Classify as risk-on, risk-off, or transitional with evidence.
2. **Trend Assessment** — Use SMA alignment (SMA20 vs SMA50 vs SMA200), EMA crossovers, and trend_strength to assess direction and conviction.
3. **Volatility Analysis** — Reference ATR, Bollinger Band width, and volatility_regime. Quantify whether vol is expanding or contracting.
4. **Momentum Snapshot** — Use RSI_14, MACD, MACD histogram, and momentum_score to identify divergences or confirmations.
5. **Risk Level** — Synthesize regime + volatility + momentum into Low/Medium/High/Extreme risk assessment.
6. **Strong vs Weak Assets** — Rank assets by opportunity_score total_score and momentum_score. Identify leaders and laggards.

IMPORTANT: Reference actual numeric values from the data (RSI=XX, SMA20=XX, total_score=XX). Be specific, not generic.
Format with markdown. Never promise returns. Focus on probabilistic analysis.`,

  "asset-selector": `You are an Asset Selector agent for a professional investment platform.

You receive COMPUTED TECHNICAL INDICATORS (market_features) and OPPORTUNITY SCORES with sub-score breakdowns.

Analyze and deliver:
1. **Asset Ranking Table** — Rank ALL assets by total_score. Include: Symbol | Score | Direction | Momentum | Structure | Strategy Family
2. **Top Opportunities** — Top 3-5 by total_score. For each: explain WHY using the sub-scores (structure, momentum, volatility, strategy, rr, macro, sentiment, historical).
3. **Assets to Avoid** — Lowest scored assets. Reference specific weak sub-scores.
4. **Direction Consensus** — Group assets by direction (long/short/neutral). Note any divergences from the computed direction.
5. **Strategy Alignment** — Group assets by recommended strategy_family. Flag mismatches.

Use markdown tables. Reference actual scores. Never promise returns.`,

  "strategy-engine": `You are a Strategy Engine agent for a professional investment platform.

You receive COMPUTED TECHNICAL INDICATORS and OPPORTUNITY SCORES with strategy_family recommendations.

Determine:
1. **Optimal Strategy Mix** — Based on the strategy_family distribution across assets and current market_regime. Recommend capital allocation % per strategy.
2. **Strategy Activation Matrix** — For each strategy family (trend_following, momentum, mean_reversion, breakout, volatility), list which assets match and their scores.
3. **Regime-Strategy Fit** — Cross-reference market_regime with strategy effectiveness. Flag strategies that underperform in current regime.
4. **Risk-Adjusted Recommendations** — Factor volatility_regime and ATR into position timing. High volatility = smaller size or wait.
5. **Entry Timing** — Use Bollinger position, RSI zones, and MACD crossovers to suggest optimal entry timing.

Reference the user's risk parameters (capital, risk_per_trade, max_positions). Be specific and actionable.`,

  "risk-manager": `You are a Risk Manager agent for a professional investment platform. Capital protection is your #1 priority.

You receive COMPUTED TECHNICAL INDICATORS, OPPORTUNITY SCORES, current PORTFOLIO positions, and USER RISK PARAMETERS.

Deliver:
1. **Portfolio Risk Score** — 0-100 composite risk level based on: concentration, correlation, volatility exposure, drawdown proximity.
2. **Exposure Analysis** — Map positions against market_regime. Flag positions fighting the trend (e.g., long in bear_market regime).
3. **Position Sizing Audit** — Given user's risk_per_trade and current_capital, verify each position is correctly sized. Use ATR for stop distance.
4. **Stop Loss Adequacy** — Compare each position's SL to ATR_14 * 1.5. Flag stops that are too tight (< 1x ATR) or too loose (> 3x ATR).
5. **Concentration Risk** — Check max_single_asset and max_correlation limits. Flag violations.
6. **Drawdown Monitor** — Calculate current drawdown vs max_drawdown limit. If approaching limit: BLOCK new entries.
7. **Action Items** — For each issue: APPROVE / ADJUST (with specifics) / BLOCK (with reason).

Be strict. Use numbers. BLOCK means BLOCK. Format with markdown.`,

  "order-preparator": `You are an Order Preparator agent for a professional investment platform.

You receive COMPUTED TECHNICAL INDICATORS, OPPORTUNITY SCORES, and USER RISK PARAMETERS.

For the top-scored opportunities (total_score >= 45), prepare executable orders:

For EACH order:
1. **Symbol** and **Direction** (from opportunity_scores direction field)
2. **Entry Price** — Use current support/resistance levels and Bollinger bands for limit entries. Or "Market" if momentum is strong.
3. **Stop Loss** — Set at support_level (for longs) or resistance_level (for shorts), adjusted by ATR_14. Must be >= 1x ATR away.
4. **Take Profit** — Set to achieve minimum R:R of user's min_rr_ratio. Use next resistance (longs) or support (shorts).
5. **Position Size** — Calculate: (current_capital * risk_per_trade%) / (entry - stop_loss). Round to appropriate lot size.
6. **Risk/Reward Ratio** — Must meet minimum from user settings.
7. **Confidence** — Map from total_score: 80+ = Very High, 65+ = High, 50+ = Medium, <50 = Low.
8. **Strategy** — From strategy_family in opportunity_scores.
9. **Reasoning** — Reference specific indicators: "RSI at X shows..., MACD histogram at X confirms..., structure_score X indicates..."

Present each order in a clear format. Include ALL numeric parameters.`,

  "portfolio-manager": `You are a Portfolio Manager agent for a professional investment platform.

You receive PORTFOLIO positions, MARKET FEATURES, OPPORTUNITY SCORES, and USER SETTINGS.

Analyze and recommend:
1. **Diversification Score** (0-100) — Based on: asset_type distribution, strategy_family diversity, direction balance, correlation estimate.
2. **Rebalancing Needs** — Compare current allocation vs optimal (based on opportunity scores and regime). List specific trades to rebalance.
3. **Regime Alignment** — Are positions aligned with current market_regime? Score each position's regime fit.
4. **Cash Management** — Given current_capital and position exposure, recommend cash reserve %. Higher in volatile/bear regimes.
5. **Correlation Risks** — Identify positions with similar strategy_family and direction that amplify risk. Check vs max_correlation.
6. **Action Plan** — Prioritized list: what to close, reduce, hold, or add. Reference opportunity scores for add candidates.

Use data. Format with markdown tables.`,

  "learning-agent": `You are a Learning Agent for a professional investment platform.

You receive TRADE JOURNAL entries (with entry_reasoning, exit_reasoning, lessons_learned, mistake_tags, r_multiple, opportunity_score, market_regime), STRATEGY PERFORMANCE aggregates, and current OPPORTUNITY SCORES.

Deliver:
1. **Performance Metrics** — Win rate, avg R-multiple, total PnL, best/worst trade. Calculate from the trade journal data.
2. **Strategy Performance Matrix** — Which strategy_family has best win rate, best avg R-multiple, worst drawdown? Use the strategy_performance data directly.
3. **Regime Performance** — In which market_regime did the user perform best? Cross-reference journal entries' market_regime with actual PnL outcomes.
4. **Score Calibration** — Compare opportunity_scores of closed trades vs actual PnL outcomes. Group by score ranges (80+, 65-80, 45-65, <45) and show win rate and avg PnL for each.
5. **Behavioral Patterns** — Analyze mistake_tags frequency: which errors cost the most money? Look for patterns like: FOMO entries correlate with losses, revenge trades, etc.
6. **Lessons Database** — Summarize the user's own lessons_learned entries. Find recurring themes.
7. **Improvement Plan** — 3-5 specific, measurable, data-backed recommendations. Reference which strategy_family to focus on, which regimes to avoid, which mistakes to eliminate.

Be honest and data-driven. Use actual numbers from the data. Format with markdown tables where appropriate.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { agent, marketData, portfolioData, tradeHistory, language, marketFeatures, opportunityScores, strategyPerformance } = await req.json();

    const systemPrompt = AGENT_PROMPTS[agent];
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown agent: ${agent}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Language instruction
    const langMap: Record<string, string> = {
      es: "IMPORTANT: You MUST write your ENTIRE response in Spanish (Español). All headers, analysis, recommendations and text must be in Spanish.",
      pt: "IMPORTANT: You MUST write your ENTIRE response in Portuguese (Português). All headers, analysis, recommendations and text must be in Portuguese.",
      fr: "IMPORTANT: You MUST write your ENTIRE response in French (Français). All headers, analysis, recommendations and text must be in French.",
      en: "Write your response in English.",
    };
    const langInstruction = langMap[language] || langMap["en"];

    // Build structured context
    let context = "";

    // Computed market features (technical indicators) - PRIMARY data source
    if (marketFeatures && Object.keys(marketFeatures).length > 0) {
      context += `\n\n## COMPUTED TECHNICAL INDICATORS (market_features)\nThese are pre-computed indicators from OHLCV data. Use these as your primary data source.\n\`\`\`json\n${JSON.stringify(marketFeatures, null, 2)}\n\`\`\``;
    }

    // Opportunity scores with sub-score breakdown
    if (opportunityScores && opportunityScores.length > 0) {
      context += `\n\n## OPPORTUNITY SCORES\nPre-computed weighted scores (0-100) for each asset. Higher = better opportunity.\n\`\`\`json\n${JSON.stringify(opportunityScores, null, 2)}\n\`\`\``;
    }

    // Live price data (supplementary)
    if (marketData) {
      const md = marketData.marketData || marketData;
      const uc = marketData.userConfig;
      if (Array.isArray(md) && md.length > 0) {
        context += `\n\n## LIVE MARKET PRICES (supplementary)\n\`\`\`json\n${JSON.stringify(md, null, 2)}\n\`\`\``;
      }
      if (uc) {
        context += `\n\n## USER CAPITAL & RISK PARAMETERS\n\`\`\`json\n${JSON.stringify(uc, null, 2)}\n\`\`\``;
      }
    }

    if (portfolioData && (Array.isArray(portfolioData) ? portfolioData.length > 0 : true)) {
      context += `\n\n## CURRENT PORTFOLIO (open positions)\n\`\`\`json\n${JSON.stringify(portfolioData, null, 2)}\n\`\`\``;
    }

    if (tradeHistory && (Array.isArray(tradeHistory) ? tradeHistory.length > 0 : true)) {
      context += `\n\n## TRADE HISTORY (closed positions)\n\`\`\`json\n${JSON.stringify(tradeHistory, null, 2)}\n\`\`\``;
    }

    if (strategyPerformance && strategyPerformance.length > 0) {
      context += `\n\n## STRATEGY PERFORMANCE (historical stats)\n\`\`\`json\n${JSON.stringify(strategyPerformance, null, 2)}\n\`\`\``;
    }

    const userMessage = `${langInstruction}\n\nAnalyze the following STRUCTURED DATA and provide your professional assessment. Reference actual values from the computed indicators and scores.${context}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
