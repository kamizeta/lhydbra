import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AgentType =
  | "market-analyst"
  | "asset-selector"
  | "strategy-engine"
  | "risk-manager"
  | "order-preparator"
  | "portfolio-manager"
  | "learning-agent";

const AGENT_PROMPTS: Record<AgentType, string> = {
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

const langMap: Record<string, string> = {
  es: "IMPORTANT: You MUST write your ENTIRE response in Spanish (Español). All headers, analysis, recommendations and text must be in Spanish.",
  pt: "IMPORTANT: You MUST write your ENTIRE response in Portuguese (Português). All headers, analysis, recommendations and text must be in Portuguese.",
  fr: "IMPORTANT: You MUST write your ENTIRE response in French (Français). All headers, analysis, recommendations and text must be in French.",
  en: "Write your response in English.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildContext(payload: Record<string, any>) {
  let context = "";
  const { marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance } = payload;

  if (marketFeatures && Object.keys(marketFeatures).length > 0) {
    context += `\n\n## COMPUTED TECHNICAL INDICATORS (market_features)\nThese are pre-computed indicators from OHLCV data. Use these as your primary data source.\n\
\`\`\`json\n${JSON.stringify(marketFeatures, null, 2)}\n\`\`\``;
  }

  if (Array.isArray(opportunityScores) && opportunityScores.length > 0) {
    context += `\n\n## OPPORTUNITY SCORES\nPre-computed weighted scores (0-100) for each asset. Higher = better opportunity.\n\`\`\`json\n${JSON.stringify(opportunityScores, null, 2)}\n\`\`\``;
  }

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

  if (Array.isArray(strategyPerformance) && strategyPerformance.length > 0) {
    context += `\n\n## STRATEGY PERFORMANCE (historical stats)\n\`\`\`json\n${JSON.stringify(strategyPerformance, null, 2)}\n\`\`\``;
  }

  return context;
}

async function generateAgentContent(apiKey: string, agent: AgentType, language: string, payload: Record<string, any>) {
  const systemPrompt = AGENT_PROMPTS[agent];
  const langInstruction = langMap[language] || langMap.en;
  const userMessage = `${langInstruction}\n\nAnalyze the following STRUCTURED DATA and provide your professional assessment. Reference actual values from the computed indicators and scores.${buildContext(payload)}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 402) throw new Error("AI credits exhausted. Please add credits in Settings → Workspace → Usage.");
    if (response.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
    console.error("process-agent-runs gateway error:", response.status, text);
    throw new Error(`AI gateway error (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function parseAndSaveSignals(apiKey: string, admin: ReturnType<typeof createClient>, userId: string, orderPreparatorOutput: string, language: string) {
  if (!orderPreparatorOutput) return;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a trade signal extractor. Extract ALL trade signals from the order preparator output. ${language === "es" ? "Field values (reasoning, agentAnalysis) must be in Spanish." : language === "pt" ? "Field values (reasoning, agentAnalysis) must be in Portuguese." : language === "fr" ? "Field values (reasoning, agentAnalysis) must be in French." : ""}`,
        },
        {
          role: "user",
          content: `Extract all trade signals from this output:\n\n${orderPreparatorOutput}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_trade_signals",
            description: "Save extracted trade signals to the database.",
            parameters: {
              type: "object",
              properties: {
                signals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      name: { type: "string" },
                      asset_type: { type: "string", enum: ["crypto", "stock", "etf", "commodity", "forex"] },
                      direction: { type: "string", enum: ["long", "short"] },
                      strategy: { type: "string" },
                      strategy_family: { type: "string", enum: ["trend_following", "momentum", "mean_reversion", "breakout", "volatility", "swing"] },
                      entry_price: { type: "number" },
                      stop_loss: { type: "number" },
                      take_profit: { type: "number" },
                      risk_reward: { type: "number" },
                      position_size: { type: "number" },
                      risk_percent: { type: "number" },
                      confidence: { type: "integer" },
                      reasoning: { type: "string" },
                      agent_analysis: { type: "string" },
                      opportunity_score: { type: "number" },
                      market_regime: { type: "string" },
                    },
                    required: ["symbol", "name", "asset_type", "direction", "strategy", "entry_price", "stop_loss", "take_profit", "risk_reward", "confidence", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["signals"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_trade_signals" } },
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("process-agent-runs signal extraction error:", response.status, text);
    return;
  }

  const aiResult = await response.json();
  let signals: any[] = [];
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    try {
      const args = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      signals = Array.isArray(args.signals) ? args.signals : [];
    } catch (error) {
      console.error("process-agent-runs failed to parse signal tool call:", error);
    }
  }

  if (!signals.length) return;

  const rows = signals.map((signal) => ({
    user_id: userId,
    symbol: signal.symbol || "UNKNOWN",
    name: signal.name || signal.symbol || "Unknown",
    asset_type: signal.asset_type || "stock",
    direction: signal.direction || "long",
    strategy: signal.strategy || "AI Generated",
    strategy_family: signal.strategy_family || null,
    entry_price: Number(signal.entry_price) || 0,
    stop_loss: Number(signal.stop_loss) || 0,
    take_profit: Number(signal.take_profit) || 0,
    risk_reward: Number(signal.risk_reward) || 1.5,
    position_size: signal.position_size ? Number(signal.position_size) : null,
    risk_percent: signal.risk_percent ? Number(signal.risk_percent) : null,
    confidence: Math.min(100, Math.max(0, Number(signal.confidence) || 50)),
    reasoning: signal.reasoning || null,
    agent_analysis: signal.agent_analysis || null,
    opportunity_score: signal.opportunity_score ? Number(signal.opportunity_score) : null,
    market_regime: signal.market_regime || null,
    status: "pending",
  }));

  const { error } = await admin.from("trade_signals").insert(rows);
  if (error) console.error("process-agent-runs failed to save signals:", error);
}

async function processRun(admin: ReturnType<typeof createClient>, apiKey: string, run: any) {
  const now = new Date().toISOString();
  const requestedAgents = Array.isArray(run.requested_agents) ? (run.requested_agents as AgentType[]) : [];
  const payload = (run.input_payload || {}) as Record<string, any>;
  let hasFailures = false;

  await admin
    .from("agent_runs")
    .update({
      status: "processing",
      started_at: run.started_at || now,
      updated_at: now,
    })
    .eq("id", run.id);

  for (const agent of requestedAgents) {
    const { data: existing } = await admin
      .from("agent_run_results")
      .select("status, started_at")
      .eq("run_id", run.id)
      .eq("agent_type", agent)
      .maybeSingle();

    if (existing?.status === "completed") continue;

    await admin
      .from("agent_runs")
      .update({ current_agent: agent, updated_at: new Date().toISOString() })
      .eq("id", run.id);

    await admin
      .from("agent_run_results")
      .update({
        status: "processing",
        error_message: null,
        started_at: existing?.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", run.id)
      .eq("agent_type", agent);

    try {
      const content = await generateAgentContent(apiKey, agent, run.language || "en", payload);
      const completedAt = new Date().toISOString();

      await admin
        .from("agent_run_results")
        .update({
          status: "completed",
          content,
          error_message: null,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("run_id", run.id)
        .eq("agent_type", agent);

      await admin.from("agent_analyses").insert({
        user_id: run.user_id,
        agent_type: agent,
        content,
        session_id: run.id,
      });

      if (agent === "order-preparator" && content) {
        await parseAndSaveSignals(apiKey, admin, run.user_id, content, run.language || "en");
      }
    } catch (error) {
      hasFailures = true;
      const message = error instanceof Error ? error.message : "Unknown error";
      const failedAt = new Date().toISOString();

      await admin
        .from("agent_run_results")
        .update({
          status: "failed",
          content: `Error: ${message}`,
          error_message: message,
          completed_at: failedAt,
          updated_at: failedAt,
        })
        .eq("run_id", run.id)
        .eq("agent_type", agent);
    }
  }

  const finishedAt = new Date().toISOString();
  await admin
    .from("agent_runs")
    .update({
      status: hasFailures ? "failed" : "completed",
      current_agent: null,
      error_message: hasFailures ? "One or more agents failed." : null,
      completed_at: finishedAt,
      updated_at: finishedAt,
    })
    .eq("id", run.id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!apiKey || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing required secrets" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const runId = typeof body?.runId === "string" ? body.runId : null;

    let query = admin
      .from("agent_runs")
      .select("*")
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: true })
      .limit(runId ? 1 : 3);

    if (runId) query = query.eq("id", runId);

    const { data: runs, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    const eligibleRuns = (runs || []).filter((run) => {
      if (run.status !== "processing") return true;
      const updatedAt = run.updated_at ? new Date(run.updated_at).getTime() : 0;
      return Date.now() - updatedAt > 45000;
    });

    for (const run of eligibleRuns) {
      await processRun(admin, apiKey, run);
    }

    return jsonResponse({ processed: eligibleRuns.length });
  } catch (error) {
    console.error("process-agent-runs error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
