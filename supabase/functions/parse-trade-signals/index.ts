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

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get auth token from request
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

    const { orderPreparatorOutput, marketData, language } = await req.json();

    if (!orderPreparatorOutput) {
      return new Response(JSON.stringify({ error: "No order preparator output provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = {
      es: "Respond ONLY with the JSON array, no extra text. Field values (reasoning, agentAnalysis) must be in Spanish.",
      pt: "Respond ONLY with the JSON array, no extra text. Field values (reasoning, agentAnalysis) must be in Portuguese.",
      fr: "Respond ONLY with the JSON array, no extra text. Field values (reasoning, agentAnalysis) must be in French.",
      en: "Respond ONLY with the JSON array, no extra text.",
    };

    const extractPrompt = `You are a JSON extractor. Given the AI agent's order preparator output below, extract ALL trade signals/ideas into a JSON array.

Each object must have exactly these fields:
- symbol (string, e.g. "BTC/USD", "AAPL")
- name (string, full asset name)
- asset_type (string: "crypto", "stock", "etf", or "commodity")
- direction (string: "long" or "short")
- strategy (string, strategy name)
- entry_price (number)
- stop_loss (number)
- take_profit (number)
- risk_reward (number, the R:R ratio)
- position_size (number or null)
- risk_percent (number or null)
- confidence (integer 0-100, estimate from the analysis tone)
- reasoning (string, brief reasoning)
- agent_analysis (string, key analysis points)

If no valid trade signals can be extracted, return an empty array [].

${langMap[language] || langMap["en"]}

--- ORDER PREPARATOR OUTPUT ---
${orderPreparatorOutput}
--- END ---`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: extractPrompt }],
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
    const rawContent = aiResult.choices?.[0]?.message?.content || "[]";
    
    // Extract JSON from possible markdown code blocks
    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let signals: any[];
    try {
      signals = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI output as JSON:", jsonStr);
      return new Response(JSON.stringify({ error: "Failed to parse trade signals", raw: jsonStr }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(signals) || signals.length === 0) {
      return new Response(JSON.stringify({ signals: [], message: "No signals extracted" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert signals into trade_signals table
    const rows = signals.map((s: any) => ({
      user_id: user.id,
      symbol: s.symbol || "UNKNOWN",
      name: s.name || s.symbol || "Unknown",
      asset_type: s.asset_type || "stock",
      direction: s.direction || "long",
      strategy: s.strategy || "AI Generated",
      entry_price: Number(s.entry_price) || 0,
      stop_loss: Number(s.stop_loss) || 0,
      take_profit: Number(s.take_profit) || 0,
      risk_reward: Number(s.risk_reward) || 1.5,
      position_size: s.position_size ? Number(s.position_size) : null,
      risk_percent: s.risk_percent ? Number(s.risk_percent) : null,
      confidence: Math.min(100, Math.max(0, Number(s.confidence) || 50)),
      reasoning: s.reasoning || null,
      agent_analysis: s.agent_analysis || null,
      status: "pending",
    }));

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
