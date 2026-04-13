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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    // Auth guard: require a valid Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate the caller's identity
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { user_id, event, data } = await req.json();

    // Enforce: users can only send notifications to themselves
    // Service role calls pass through getUser as service-level auth
    if (user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_email, notify_telegram_chat_id, notify_on_trade_executed, notify_on_stop_loss, notify_on_take_profit, notify_on_cooldown")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!settings) return new Response(JSON.stringify({ ok: false }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

    const eventMap: Record<string, string> = {
      trade_executed: "notify_on_trade_executed",
      stop_loss_hit: "notify_on_stop_loss",
      take_profit_hit: "notify_on_take_profit",
      cooldown_activated: "notify_on_cooldown",
    };
    if (eventMap[event] && !(settings as any)[eventMap[event]]) {
      return new Response(JSON.stringify({ ok: false, reason: "disabled" }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const messages: Record<string, string> = {
      trade_executed: `🤖 LHYDBRA ejecutó trades:\n${(data.trades || []).map((t: any) => `  • ${t.symbol} ${t.direction.toUpperCase()} — Score: ${t.score}, R: ${t.r}`).join("\n")}\n\nCapital: $${Number(data.capital || 0).toFixed(2)}`,
      stop_loss_hit: `🔴 Stop Loss: ${data.symbol}\nPérdida: $${Math.abs(Number(data.pnl || 0)).toFixed(2)} (${Number(data.r_multiple || 0).toFixed(1)}R)\nEstrategia: ${data.strategy || "—"}`,
      take_profit_hit: `🟢 Take Profit: ${data.symbol}\nGanancia: $${Number(data.pnl || 0).toFixed(2)} (${Number(data.r_multiple || 0).toFixed(1)}R)\nEstrategia: ${data.strategy || "—"}`,
      cooldown_activated: `⚠️ Cooldown activado\n${data.consecutive_losses} pérdidas seguidas (límite: ${data.limit})\nSistema pausado hasta reset.`,
    };

    const message = messages[event] || `LHYDBRA: ${event}`;
    const results: Record<string, string> = {};

    if (settings.notify_telegram_chat_id) {
      const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (token) {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: settings.notify_telegram_chat_id, text: message }),
        });
        results.telegram = r.ok ? "sent" : "failed";
      }
    }

    if (settings.notify_email) {
      const key = Deno.env.get("RESEND_API_KEY");
      if (key) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            from: "LHYDBRA <alerts@resend.dev>",
            to: [settings.notify_email],
            subject: `LHYDBRA: ${event.replace(/_/g, " ")}`,
            text: message,
          }),
        });
        results.email = r.ok ? "sent" : "failed";
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
