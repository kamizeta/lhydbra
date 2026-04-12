import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonRes(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Require service role
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return jsonRes(req, { error: "Forbidden" }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const results: Record<string, unknown>[] = [];

  // Get all users with operator mode enabled
  const { data: users } = await supabase
    .from("user_settings")
    .select("user_id, paper_trading")
    .eq("operator_mode", true);

  const alpacaKeyId = Deno.env.get("ALPACA_API_KEY_ID") || "";
  const alpacaSecret = Deno.env.get("ALPACA_API_SECRET_KEY") || "";

  if (!alpacaKeyId || !alpacaSecret) {
    return jsonRes(req, { error: "Alpaca API keys not configured" }, 500);
  }

  for (const u of (users || [])) {
    const isPaper = u.paper_trading !== false; // Default to paper
    const alpacaBase = isPaper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";
    const alpacaHeaders = {
      "APCA-API-KEY-ID": alpacaKeyId,
      "APCA-API-SECRET-KEY": alpacaSecret,
    };

    try {
      // 1. Get Alpaca positions
      const alpacaRes = await fetch(`${alpacaBase}/v2/positions`, {
        headers: alpacaHeaders,
        signal: AbortSignal.timeout(8000),
      });
      const alpacaPositions = alpacaRes.ok ? await alpacaRes.json() : [];

      // 2. Get DB positions
      const { data: dbPositions } = await supabase
        .from("positions")
        .select("*")
        .eq("user_id", u.user_id)
        .eq("status", "open");

      const alpacaSymbols = new Set(alpacaPositions.map((p: any) => p.symbol));
      const dbSymbols = new Set((dbPositions || []).map((p: any) => p.symbol));

      const discrepancies: Record<string, unknown>[] = [];

      // 3. In Alpaca but not in DB → create
      for (const ap of alpacaPositions) {
        if (!dbSymbols.has(ap.symbol)) {
          discrepancies.push({ type: "alpaca_only", symbol: ap.symbol, qty: ap.qty });
          await supabase.from("positions").insert({
            user_id: u.user_id,
            symbol: ap.symbol,
            name: ap.symbol,
            asset_type: ap.asset_class === "crypto" ? "crypto" : "stock",
            direction: parseFloat(ap.qty) > 0 ? "long" : "short",
            quantity: Math.abs(parseFloat(ap.qty)),
            avg_entry: parseFloat(ap.avg_entry_price),
            status: "open",
            notes: "Created by reconciliation engine",
          });
        }
      }

      // 4. In DB but not in Alpaca → close
      for (const dp of (dbPositions || [])) {
        if (!alpacaSymbols.has(dp.symbol)) {
          discrepancies.push({ type: "db_only", symbol: dp.symbol, qty: dp.quantity });
          await supabase.from("positions").update({
            status: "closed",
            closed_at: new Date().toISOString(),
            notes: (dp.notes || "") + " | Closed by reconciliation (not found in broker)",
            updated_at: new Date().toISOString(),
          }).eq("id", dp.id);
        }
      }

      // 5. Both exist but qty mismatch → correct DB
      for (const ap of alpacaPositions) {
        const dbPos = (dbPositions || []).find((p: any) => p.symbol === ap.symbol);
        if (dbPos) {
          const alpacaQty = Math.abs(parseFloat(ap.qty));
          const dbQty = Math.abs(Number(dbPos.quantity));
          if (Math.abs(alpacaQty - dbQty) > 0.001) {
            discrepancies.push({
              type: "qty_mismatch", symbol: ap.symbol,
              alpaca_qty: alpacaQty, db_qty: dbQty,
            });
            await supabase.from("positions").update({
              quantity: alpacaQty,
              avg_entry: parseFloat(ap.avg_entry_price),
              notes: (dbPos.notes || "") + ` | Qty corrected by reconciliation: ${dbQty}->${alpacaQty}`,
              updated_at: new Date().toISOString(),
            }).eq("id", dbPos.id);
          }
        }
      }

      // 6. Kill switch if too many discrepancies
      if (discrepancies.length > 3) {
        await supabase.from("system_config").update({
          trading_enabled: false,
          kill_switch_reason: `Auto-killed: ${discrepancies.length} reconciliation discrepancies found`,
          updated_at: new Date().toISOString(),
        }).eq("id", "global");

        console.error(`[reconcile] KILL SWITCH activated for user ${u.user_id}: ${discrepancies.length} discrepancies`);

        // Send notification
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              user_id: u.user_id,
              event: "reconciliation_alert",
              data: { discrepancies: discrepancies.length, kill_switch: true },
            }),
          });
        } catch (notifyErr) {
          console.warn(`[reconcile] Kill switch notification failed:`, notifyErr);
        }
      }

      if (discrepancies.length > 0) {
        console.log(`[reconcile] User ${u.user_id}: ${discrepancies.length} discrepancies resolved`);
      }

      results.push({ user_id: u.user_id, discrepancies_count: discrepancies.length, discrepancies });
    } catch (err) {
      console.error(`[reconcile] Error for user ${u.user_id}:`, err);
      results.push({ user_id: u.user_id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return jsonRes(req, {
    results,
    users_processed: results.length,
    timestamp: new Date().toISOString(),
  });
});
