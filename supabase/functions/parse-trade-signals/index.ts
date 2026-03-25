import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { orderPreparatorOutput, language } = await req.json();

    if (!orderPreparatorOutput) {
      return new Response(JSON.stringify({ error: "No order preparator output provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = {
      es: "Field values (reasoning, agentAnalysis) must be in Spanish.",
      pt: "Field values (reasoning, agentAnalysis) must be in Portuguese.",
      fr: "Field values (reasoning, agentAnalysis) must be in French.",
      en: "",
    };

    // Use tool calling for structured extraction
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a trade signal extractor. Extract ALL trade signals from the order preparator output. ${langMap[language] || ""}`,
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
                        symbol: { type: "string", description: "Trading symbol e.g. BTC/USD, AAPL" },
                        name: { type: "string", description: "Full asset name" },
                        asset_type: { type: "string", enum: ["crypto", "stock", "etf", "commodity", "forex"] },
                        direction: { type: "string", enum: ["long", "short"] },
                        strategy: { type: "string", description: "Strategy name" },
                        strategy_family: { type: "string", enum: ["trend_following", "momentum", "mean_reversion", "breakout", "volatility", "swing"], description: "Strategy family category" },
                        entry_price: { type: "number" },
                        stop_loss: { type: "number" },
                        take_profit: { type: "number" },
                        risk_reward: { type: "number", description: "Risk/Reward ratio" },
                        position_size: { type: "number", description: "Position size in units" },
                        risk_percent: { type: "number", description: "Risk percentage of capital" },
                        confidence: { type: "integer", description: "Confidence 0-100" },
                        reasoning: { type: "string", description: "Brief reasoning for the trade" },
                        agent_analysis: { type: "string", description: "Key analysis points with indicator values" },
                        opportunity_score: { type: "number", description: "Opportunity score if mentioned" },
                        market_regime: { type: "string", description: "Market regime at time of signal" },
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
      const errText = await response.text();
      console.error("AI extraction error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Failed to extract trade signals" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    
    // Extract from tool call response
    let signals: any[] = [];
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
        signals = args.signals || [];
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
        // Fallback: try legacy content extraction
        const rawContent = aiResult.choices?.[0]?.message?.content || "[]";
        let jsonStr = rawContent.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        try { signals = JSON.parse(jsonStr); } catch { signals = []; }
      }
    }

    if (!Array.isArray(signals) || signals.length === 0) {
      return new Response(JSON.stringify({ signals: [], count: 0, message: "No signals extracted" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enrich signals with opportunity_scores from DB when AI doesn't provide them
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);
    const signalSymbols = [...new Set(signals.map((s: any) => s.symbol).filter(Boolean))];
    let scoreMap: Record<string, any> = {};
    if (signalSymbols.length > 0) {
      const { data: scores } = await db.from("opportunity_scores")
        .select("symbol, total_score, structure_score, momentum_score, volatility_score, strategy_score, rr_score, macro_score, sentiment_score, historical_score")
        .in("symbol", signalSymbols);
      if (scores) {
        for (const s of scores) scoreMap[s.symbol] = s;
      }
    }

    // Insert signals into trade_signals table
    const rows = signals.map((s: any) => {
      const dbScore = scoreMap[s.symbol];
      const oppScore = s.opportunity_score ? Number(s.opportunity_score) : (dbScore?.total_score ?? null);
      const breakdown = dbScore ? {
        structure: dbScore.structure_score, momentum: dbScore.momentum_score,
        volatility: dbScore.volatility_score, strategy: dbScore.strategy_score,
        rr: dbScore.rr_score, macro: dbScore.macro_score,
        sentiment: dbScore.sentiment_score, historical: dbScore.historical_score,
      } : null;

      return {
        user_id: user.id,
        symbol: s.symbol || "UNKNOWN",
        name: s.name || s.symbol || "Unknown",
        asset_type: s.asset_type || "stock",
        direction: s.direction || "long",
        strategy: s.strategy || "AI Generated",
        strategy_family: s.strategy_family || null,
        entry_price: Number(s.entry_price) || 0,
        stop_loss: Number(s.stop_loss) || 0,
        take_profit: Number(s.take_profit) || 0,
        risk_reward: Number(s.risk_reward) || 1.5,
        position_size: s.position_size ? Number(s.position_size) : null,
        risk_percent: s.risk_percent ? Number(s.risk_percent) : null,
        confidence: Math.min(100, Math.max(0, Number(s.confidence) || 50)),
        reasoning: s.reasoning || null,
        agent_analysis: s.agent_analysis || null,
        opportunity_score: oppScore,
        score_breakdown: breakdown,
        market_regime: s.market_regime || null,
        status: "pending",
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("trade_signals")
      .insert(rows)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save trade signals", details: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ signals: inserted, count: inserted?.length || 0 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-trade-signals error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
