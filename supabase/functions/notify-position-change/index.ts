import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { type, record, old_record } = payload;

    if (!record) {
      return new Response(JSON.stringify({ ok: false, reason: "no record" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = record.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, reason: "no user_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user notification settings
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_telegram_chat_id, notify_on_trade_executed, notify_on_stop_loss, notify_on_take_profit")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.notify_telegram_chat_id) {
      return new Response(JSON.stringify({ ok: false, reason: "no telegram configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build message based on event type
    let message = "";
    const symbol = record.symbol || "—";
    const direction = (record.direction || "").toUpperCase();
    const qty = record.quantity || 0;
    const entry = Number(record.avg_entry || 0).toFixed(2);

    if (type === "INSERT") {
      // Position opened
      message = [
        "📈 *Nueva posición abierta*",
        "",
        `• Símbolo: \`${symbol}\``,
        `• Dirección: ${direction}`,
        `• Cantidad: ${qty}`,
        `• Entrada: $${entry}`,
        record.stop_loss ? `• Stop Loss: $${Number(record.stop_loss).toFixed(2)}` : "",
        record.take_profit ? `• Take Profit: $${Number(record.take_profit).toFixed(2)}` : "",
        record.strategy ? `• Estrategia: ${record.strategy}` : "",
      ].filter(Boolean).join("\n");
    } else if (type === "UPDATE") {
      // Check if position was closed
      const wasClosed = record.status === "closed" && old_record?.status !== "closed";

      if (wasClosed) {
        const pnl = Number(record.pnl || 0);
        const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
        const rMultiple = record.actual_r_multiple
          ? ` (${Number(record.actual_r_multiple).toFixed(1)}R)`
          : "";

        message = [
          `${pnlEmoji} *Posición cerrada*`,
          "",
          `• Símbolo: \`${symbol}\``,
          `• Dirección: ${direction}`,
          `• Entrada: $${entry}`,
          `• Cierre: $${Number(record.close_price || 0).toFixed(2)}`,
          `• PnL: $${pnl.toFixed(2)}${rMultiple}`,
          record.strategy ? `• Estrategia: ${record.strategy}` : "",
        ].filter(Boolean).join("\n");
      } else {
        // Other updates (SL/TP changes, notes, etc.)
        const changes: string[] = [];

        if (old_record?.stop_loss !== record.stop_loss && record.stop_loss != null) {
          changes.push(`• Stop Loss: $${Number(old_record?.stop_loss || 0).toFixed(2)} → $${Number(record.stop_loss).toFixed(2)}`);
        }
        if (old_record?.take_profit !== record.take_profit && record.take_profit != null) {
          changes.push(`• Take Profit: $${Number(old_record?.take_profit || 0).toFixed(2)} → $${Number(record.take_profit).toFixed(2)}`);
        }
        if (old_record?.quantity !== record.quantity) {
          changes.push(`• Cantidad: ${old_record?.quantity || 0} → ${record.quantity}`);
        }

        if (changes.length === 0) {
          return new Response(JSON.stringify({ ok: false, reason: "no notable changes" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        message = [
          "✏️ *Posición modificada*",
          "",
          `• Símbolo: \`${symbol}\``,
          ...changes,
        ].join("\n");
      }
    } else if (type === "DELETE") {
      message = `🗑️ *Posición eliminada*\n\n• Símbolo: \`${symbol}\`\n• Dirección: ${direction}`;
    }

    if (!message) {
      return new Response(JSON.stringify({ ok: false, reason: "no message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send Telegram message
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, reason: "no bot token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.notify_telegram_chat_id,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    // Also persist to notifications table
    const titleMap: Record<string, string> = {
      INSERT: "Posición abierta",
      UPDATE: record.status === "closed" ? "Posición cerrada" : "Posición modificada",
      DELETE: "Posición eliminada",
    };

    await supabase.from("notifications").insert({
      user_id: userId,
      title: titleMap[type] || "Cambio en posición",
      message: message.replace(/\*/g, "").replace(/`/g, ""),
      type: "position_change",
      category: "positions",
      severity: type === "DELETE" || (record.status === "closed" && Number(record.pnl || 0) < 0)
        ? "warning"
        : "info",
      metadata: { symbol, type, position_id: record.id },
    });

    return new Response(
      JSON.stringify({ ok: true, telegram: tgResponse.ok ? "sent" : "failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("notify-position-change error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
