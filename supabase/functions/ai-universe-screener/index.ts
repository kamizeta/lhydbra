import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROTECTED_SYMBOLS = new Set(["BTC/USD", "ETH/USD"]);
const MAX_WATCHLIST = 25;

async function discoverHighMomentumTickers(apiKey: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Today is ${today}. You are a Wall Street asset screener. Identify 5 to 10 US stock tickers (NASDAQ/NYSE only) that are exhibiting the highest real-world momentum narratives RIGHT NOW — earnings beats, sector rotation catalysts, institutional accumulation, breakout setups, or macro tailwinds.

Return ONLY a valid JSON array of ticker strings. No markdown, no explanation, no code blocks. Example: ["NVDA","PLTR","SOFI"]`,
      }],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Anthropic API error ${resp.status}: ${errText}`);
  }

  const result = await resp.json();
  const text = (result?.content?.[0]?.text || "").trim();
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) throw new Error("AI did not return an array");
  return parsed
    .filter((t: unknown) => typeof t === "string" && /^[A-Z]{1,5}$/.test(t as string))
    .map((t: string) => t.toUpperCase());
}

function mergeWatchlists(oldList: string[], newTickers: string[]): string[] {
  const combined = [...oldList, ...newTickers];
  const unique = [...new Set(combined)];

  if (unique.length <= MAX_WATCHLIST) return unique;

  const protectedItems = unique.filter(s => PROTECTED_SYMBOLS.has(s));
  const unprotected = unique.filter(s => !PROTECTED_SYMBOLS.has(s));

  const trimmed = unprotected.slice(unprotected.length - (MAX_WATCHLIST - protectedItems.length));
  return [...protectedItems, ...trimmed];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const isScheduled = body.scheduled === true;
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;

    if (!isScheduled && !isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    console.log("[screener] Calling Anthropic for momentum tickers...");
    const newTickers = await discoverHighMomentumTickers(anthropicKey);
    console.log("[screener] AI discovered:", newTickers);

    if (newTickers.length === 0) {
      return new Response(JSON.stringify({ message: "AI returned no tickers", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allSettings, error: fetchErr } = await admin
      .from("user_settings")
      .select("user_id, watchlist");

    if (fetchErr) throw new Error(`Failed to fetch user_settings: ${fetchErr.message}`);
    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No users found", updated: 0, discovered: newTickers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    for (const setting of allSettings) {
      const oldWatchlist: string[] = Array.isArray(setting.watchlist) ? setting.watchlist : [];
      const merged = mergeWatchlists(oldWatchlist, newTickers);

      if (JSON.stringify(merged) === JSON.stringify(oldWatchlist)) continue;

      const { error: updateErr } = await admin
        .from("user_settings")
        .update({ watchlist: merged, updated_at: new Date().toISOString() })
        .eq("user_id", setting.user_id);

      if (updateErr) {
        console.error(`[screener] Failed to update user ${setting.user_id}:`, updateErr.message);
      } else {
        updatedCount++;
        console.log(`[screener] Updated user ${setting.user_id}: ${oldWatchlist.length} → ${merged.length} symbols`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      discovered: newTickers,
      users_updated: updatedCount,
      total_users: allSettings.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[screener] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
