import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SIMPLIFIED: Only 2 core agents + legacy support
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
7. **Top 3 Trade Candidates** — From the highest-scored assets, provide specific entry/exit levels with reasoning.

IMPORTANT: Reference actual numeric values from the data (RSI=XX, SMA20=XX, total_score=XX). Be specific, not generic.
Keep recommendations to TOP 3 maximum. Quality over quantity.
Format with markdown. Never promise returns. Focus on probabilistic analysis.`,

  "risk-manager": `You are a Risk Manager agent for a professional investment platform. Capital protection is your #1 priority.

You receive COMPUTED TECHNICAL INDICATORS, OPPORTUNITY SCORES, current PORTFOLIO positions, and USER RISK PARAMETERS.

Deliver:
1. **Portfolio Risk Score** — 0-100 composite risk level based on: concentration, correlation, volatility exposure, drawdown proximity.
2. **Exposure Analysis** — Map positions against market_regime. Flag positions fighting the trend (e.g., long in bear_market regime).
3. **Position Sizing Audit** — Given user's risk_per_trade and current_capital, verify each position is correctly sized. Use ATR for stop distance.
4. **Stop Loss Adequacy** — Compare each position's SL to ATR_14 * 1.5. Flag stops that are too tight (< 1x ATR) or too loose (> 3x ATR).
5. **Concentration Risk** — Check max_single_asset and max_correlation limits. Flag violations.
6. **Drawdown Monitor** — Calculate current drawdown vs max_drawdown limit. If approaching limit: BLOCK new entries.
7. **Anti-Overtrading Check** — Flag if too many positions are open or if correlated assets are held simultaneously.
8. **Action Items** — For each issue: APPROVE / ADJUST (with specifics) / BLOCK (with reason).

Be strict. Use numbers. BLOCK means BLOCK. Format with markdown.`,

  // Legacy agents redirect to the 2 core agents
  "asset-selector": `You are a focused Asset Selector. Rank all available assets by opportunity score and technical quality. Present TOP 3 only. Include: Symbol, Score, Direction, Key Indicator, Strategy Family. Skip anything scoring below 65. Be concise — this feeds into trade decisions. Use markdown tables.`,

  "strategy-engine": `You are a Strategy Advisor. Based on current market regime and asset technical indicators, recommend the optimal strategy family for the top-scored assets. Keep it to 3 recommendations max. Include regime fit score. Be concise.`,

  "order-preparator": `You are an Order Preparator. For the top 3 scored opportunities only (score >= 70), prepare executable orders with: Symbol, Direction, Entry, Stop Loss (ATR-based), Take Profit (minimum R:R 1.8), Position Size (based on risk parameters), Risk %. Be precise with numbers. Maximum 3 orders.`,

  "portfolio-manager": `You are a Portfolio Manager. Analyze current portfolio for: diversification score, regime alignment, rebalancing needs. Focus on risk reduction and capital protection. Keep analysis concise — max 5 action items.`,

  "learning-agent": `You are a Learning Agent. Analyze trade journal for: win rate by strategy, best performing regime, worst mistakes (by cost), and 3 specific improvement recommendations. Use actual numbers. Be data-driven and concise.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });

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

    const langMap: Record<string, string> = {
      es: "IMPORTANT: You MUST write your ENTIRE response in Spanish (Español). All headers, analysis, recommendations and text must be in Spanish.",
      pt: "IMPORTANT: You MUST write your ENTIRE response in Portuguese (Português). All headers, analysis, recommendations and text must be in Portuguese.",
      fr: "IMPORTANT: You MUST write your ENTIRE response in French (Français). All headers, analysis, recommendations and text must be in French.",
      en: "Write your response in English.",
    };
    const langInstruction = langMap[language] || langMap["en"];

    let context = "";

    if (marketFeatures && Object.keys(marketFeatures).length > 0) {
      context += `\n\n## COMPUTED TECHNICAL INDICATORS (market_features)\n\`\`\`json\n${JSON.stringify(marketFeatures, null, 2)}\n\`\`\``;
    }

    if (opportunityScores && opportunityScores.length > 0) {
      context += `\n\n## OPPORTUNITY SCORES\n\`\`\`json\n${JSON.stringify(opportunityScores, null, 2)}\n\`\`\``;
    }

    if (marketData) {
      const md = marketData.marketData || marketData;
      const uc = marketData.userConfig;
      if (Array.isArray(md) && md.length > 0) {
        context += `\n\n## LIVE MARKET PRICES\n\`\`\`json\n${JSON.stringify(md, null, 2)}\n\`\`\``;
      }
      if (uc) {
        context += `\n\n## USER CAPITAL & RISK PARAMETERS\n\`\`\`json\n${JSON.stringify(uc, null, 2)}\n\`\`\``;
      }
    }

    if (portfolioData && (Array.isArray(portfolioData) ? portfolioData.length > 0 : true)) {
      context += `\n\n## CURRENT PORTFOLIO\n\`\`\`json\n${JSON.stringify(portfolioData, null, 2)}\n\`\`\``;
    }

    if (tradeHistory && (Array.isArray(tradeHistory) ? tradeHistory.length > 0 : true)) {
      context += `\n\n## TRADE HISTORY\n\`\`\`json\n${JSON.stringify(tradeHistory, null, 2)}\n\`\`\``;
    }

    if (strategyPerformance && strategyPerformance.length > 0) {
      context += `\n\n## STRATEGY PERFORMANCE\n\`\`\`json\n${JSON.stringify(strategyPerformance, null, 2)}\n\`\`\``;
    }

    const userMessage = `${langInstruction}\n\nAnalyze the following data. Be CONCISE — focus on actionable insights only. Maximum 3 recommendations. Reference actual values.${context}`;

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
