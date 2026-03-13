import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_PROMPTS: Record<string, string> = {
  "market-analyst": `You are an institutional-grade Market Analyst agent for a professional investment platform.

Your job is to analyze the provided market data and deliver:
1. **Market Regime** — Is the market risk-on, risk-off, or transitional? Why?
2. **Trend Assessment** — Broad market trend direction and strength
3. **Volatility Analysis** — Current volatility levels and implications
4. **Macro Context** — Relevant macro factors affecting the market now
5. **Risk Level** — Current overall market risk (Low/Medium/High/Extreme)
6. **Strong vs Weak Assets** — Which assets show strength or weakness

Be specific with numbers. Reference the actual data provided. Be concise but thorough. Format with markdown. 
Never promise returns. Focus on probabilistic analysis. Always note key risks.`,

  "asset-selector": `You are an Asset Selector agent for a professional investment platform.

Analyze the provided market data and deliver:
1. **Asset Ranking** — Rank all assets by relative strength, momentum, and opportunity
2. **Top Opportunities** — Top 3-5 assets with strongest setup and why
3. **Assets to Avoid** — Which assets show weakness or elevated risk
4. **Sector Analysis** — Which sectors/markets are leading or lagging
5. **Volume Analysis** — Notable volume patterns

Use the RSI, trend, momentum, and relative strength data. Be specific with numbers.
Format with markdown tables where useful. Never promise returns.`,

  "strategy-engine": `You are a Strategy Engine agent for a professional investment platform.

Based on current market conditions and asset data, determine:
1. **Recommended Strategy Mix** — Which strategies are best suited right now and capital allocation %
2. **Strategy Activation** — Which strategies to activate/deactivate and why
3. **Asset-Strategy Mapping** — Which assets fit which strategies
4. **Risk-Adjusted Recommendations** — Factor in current volatility and market regime
5. **Timing Considerations** — Entry timing suggestions

Available strategies: Trend Following, Momentum, Swing Trading, Mean Reversion, Breakout, Sector Rotation, Defensive, Dollar Cost Averaging, Volatility Strategy.
Be specific and actionable. Format with markdown.`,

  "risk-manager": `You are a Risk Manager agent for a professional investment platform. Capital protection is your #1 priority.

Analyze the portfolio and market data to deliver:
1. **Risk Assessment** — Current portfolio risk level and concerns
2. **Exposure Analysis** — Concentration risks, correlation risks, sector exposure
3. **Position Sizing** — Are positions appropriately sized? Recommendations
4. **Stop Loss Review** — Are stops adequate given current volatility?
5. **Drawdown Risk** — Potential drawdown scenarios
6. **Action Items** — Specific risk mitigation steps (APPROVE / ADJUST / BLOCK)

Be strict. If something violates risk rules, say BLOCK clearly. 
Use numbers. Format with markdown. Never downplay risks.`,

  "order-preparator": `You are an Order Preparator agent for a professional investment platform.

Based on the analysis and approved trade ideas, prepare:
1. **Order Details** — Entry price, Stop Loss, Take Profit for each opportunity
2. **Position Sizing** — Based on risk parameters (max 2% risk per trade)
3. **Order Type** — Limit/Market/Stop recommendation
4. **Risk/Reward Ratio** — Must be minimum 1.5:1
5. **MT4/MT5 Format** — Present orders in a format compatible with MetaTrader

Format each order clearly with all parameters. Include the logic behind each level.`,

  "portfolio-manager": `You are a Portfolio Manager agent for a professional investment platform.

Analyze the current portfolio and recommend:
1. **Diversification Score** — Rate current diversification (0-100)
2. **Rebalancing Needs** — What needs to be rebalanced and how
3. **Sector Allocation** — Current vs optimal allocation
4. **Correlation Matrix** — Highlight correlated positions that increase risk
5. **Cash Management** — How much cash to keep as reserve
6. **Action Plan** — Specific portfolio adjustments to make

Focus on risk-adjusted returns. Use data provided. Format with markdown.`,

  "learning-agent": `You are a Learning Agent for a professional investment platform.

Analyze the trade history and performance data to deliver:
1. **Performance Review** — Win rate, profit factor, best/worst trades
2. **Pattern Recognition** — What patterns led to winning vs losing trades
3. **Strategy Performance** — Which strategies are performing best/worst
4. **Behavioral Insights** — Common mistakes or biases detected
5. **Improvement Recommendations** — Specific, actionable improvements
6. **Market Condition Correlation** — Which conditions favor your trading

Be honest and constructive. Use data. Format with markdown.`,
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

    const { agent, marketData, portfolioData, tradeHistory } = await req.json();

    const systemPrompt = AGENT_PROMPTS[agent];
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown agent: ${agent}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context message with available data
    let context = "";
    if (marketData) {
      context += `\n\n## Current Market Data\n\`\`\`json\n${JSON.stringify(marketData, null, 2)}\n\`\`\``;
    }
    if (portfolioData) {
      context += `\n\n## Current Portfolio\n\`\`\`json\n${JSON.stringify(portfolioData, null, 2)}\n\`\`\``;
    }
    if (tradeHistory) {
      context += `\n\n## Trade History\n\`\`\`json\n${JSON.stringify(tradeHistory, null, 2)}\n\`\`\``;
    }

    const userMessage = `Analyze the following data and provide your professional assessment.${context}`;

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
