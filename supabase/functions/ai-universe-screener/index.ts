import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string) {
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin)
  );
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const PROTECTED_SYMBOLS = new Set(["BTC/USD", "ETH/USD"]);
const MAX_WATCHLIST = 50;

async function discoverHighMomentumTickers(apiKey: string, alphaContext?: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);

  const macroBlock = alphaContext
    ? `\n\nCONTEXTO MACROECONÓMICO DE LA DIRECCIÓN DEL FONDO (Aplica fuertemente este contexto para sesgar, aprobar o descartar oportunidades en tus operaciones matemáticas):\n${alphaContext}\n`
    : "";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Today is ${today}. You are a Wall Street asset screener. Identify 5 to 10 US stock tickers (NASDAQ/NYSE only) that are exhibiting the highest real-world momentum narratives RIGHT NOW — earnings beats, sector rotation catalysts, institutional accumulation, breakout setups, or macro tailwinds.${macroBlock}

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

function mergeWatchlists(oldList: string[], newTickers: string[], kellyProtected: Set<string>): string[] {
  const combined = [...oldList, ...newTickers];
  const unique = [...new Set(combined)];

  if (unique.length <= MAX_WATCHLIST) return unique;

  // Never trim: hardcoded protected + Kelly-positive symbols
  const isProtected = (s: string) => PROTECTED_SYMBOLS.has(s) || kellyProtected.has(s);
  const protectedItems = unique.filter(isProtected);
  const unprotected = unique.filter(s => !isProtected(s));

  const trimmed = unprotected.slice(unprotected.length - (MAX_WATCHLIST - protectedItems.length));
  return [...protectedItems, ...trimmed];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ─── Load Alpha Notes (Director macro context, last 3 days, from all users) ───
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: alphaNotes } = await admin
      .from('alpha_notes')
      .select('message')
      .eq('role', 'user')
      .gte('created_at', threeDaysAgo)
      .order('created_at', { ascending: true })
      .limit(50);
    const alphaContext = (alphaNotes ?? []).map((n: { message: string }) => n.message).join('\n---\n') || undefined;

    console.log("[screener] Calling Anthropic for momentum tickers...");
    const newTickers = await discoverHighMomentumTickers(anthropicKey, alphaContext);
    console.log("[screener] AI discovered:", newTickers);

    if (newTickers.length === 0) {
      return new Response(JSON.stringify({ message: "AI returned no tickers", updated: 0 }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: allSettings, error: fetchErr } = await admin
      .from("user_settings")
      .select("user_id, watchlist");

    if (fetchErr) throw new Error(`Failed to fetch user_settings: ${fetchErr.message}`);
    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No users found", updated: 0, discovered: newTickers }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    for (const setting of allSettings) {
      // Compute Kelly-protected symbols for this user
      const kellyProtected = new Set<string>();
      const { data: trades } = await admin
        .from("trade_journal")
        .select("symbol, pnl")
        .eq("user_id", setting.user_id)
        .limit(500);
      if (trades && trades.length > 0) {
        const grouped: Record<string, { wins: number; losses: number; avgWin: number; avgLoss: number }> = {};
        for (const t of trades) {
          const pnl = t.pnl ?? 0;
          if (pnl === 0) continue;
          if (!grouped[t.symbol]) grouped[t.symbol] = { wins: 0, losses: 0, avgWin: 0, avgLoss: 0 };
          const g = grouped[t.symbol];
          if (pnl > 0) { g.wins++; g.avgWin += pnl; }
          else { g.losses++; g.avgLoss += Math.abs(pnl); }
        }
        for (const [sym, g] of Object.entries(grouped)) {
          const total = g.wins + g.losses;
          if (total < 3) continue;
          const W = g.wins / total;
          const R = g.losses > 0 ? (g.avgWin / g.wins) / (g.avgLoss / g.losses) : 0;
          const kelly = R > 0 ? (W - (1 - W) / R) * 0.5 * 100 : 0;
          if (kelly > 0) kellyProtected.add(sym);
        }
      }

      const oldWatchlist: string[] = Array.isArray(setting.watchlist) ? setting.watchlist : [];
      const merged = mergeWatchlists(oldWatchlist, newTickers, kellyProtected);

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
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[screener] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
