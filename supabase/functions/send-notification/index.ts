import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, event, data } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_email, notify_telegram_chat_id, notify_on_trade_executed, notify_on_stop_loss, notify_on_take_profit, notify_on_cooldown")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!settings) return new Response(JSON.stringify({ ok: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const eventMap: Record<string, string> = {
      trade_executed: "notify_on_trade_executed",
      stop_loss_hit: "notify_on_stop_loss",
      take_profit_hit: "notify_on_take_profit",
      cooldown_activated: "notify_on_cooldown",
    };
    if (eventMap[event] && !(settings as any)[eventMap[event]]) {
      return new Response(JSON.stringify({ ok: false, reason: "disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
