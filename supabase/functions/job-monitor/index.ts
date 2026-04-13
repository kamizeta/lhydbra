import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JOB_LABELS: Record<string, string> = {
  "compute-indicators": "📊 Compute Indicators",
  "operator-mode": "🤖 Operator Mode",
  "alpaca-sync": "🔄 Alpaca Sync",
  "adaptive-scoring": "🎯 Adaptive Scoring",
  "telegram-daily-summary": "📬 Telegram Summary",
  "reconcile-positions": "🔁 Reconcile Positions",
  "ai-universe-screener": "🔍 AI Screener",
};

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const targetFunction = body.target_function as string;
    const targetPayload = body.payload || {};
    const jobName = JOB_LABELS[targetFunction] || targetFunction;

    if (!targetFunction) {
      return new Response(JSON.stringify({ error: "missing target_function" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    // Get chat ID from user_settings
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_telegram_chat_id")
      .not("notify_telegram_chat_id", "is", null)
      .limit(1)
      .maybeSingle();

    const chatId = settings?.notify_telegram_chat_id;

    // Call the target function
    const startTime = Date.now();
    let status = "✅";
    let detail = "";
    let httpCode = 0;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${targetFunction}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ ...targetPayload, scheduled: true }),
        signal: AbortSignal.timeout(55_000),
      });

      httpCode = response.status;
      const responseText = await response.text();

      if (response.ok) {
        // Try to extract useful info from response
        try {
          const data = JSON.parse(responseText);
          const highlights: string[] = [];
          if (data.trades_executed !== undefined) highlights.push(`Trades: ${data.trades_executed}`);
          if (data.signals_generated !== undefined) highlights.push(`Señales: ${data.signals_generated}`);
          if (data.sent !== undefined) highlights.push(`Enviados: ${data.sent}`);
          if (data.synced !== undefined) highlights.push(`Sync: ${data.synced}`);
          if (data.symbols_processed !== undefined) highlights.push(`Símbolos: ${data.symbols_processed}`);
          if (data.adjustments !== undefined) highlights.push(`Ajustes: ${data.adjustments}`);
          if (data.discrepancies !== undefined) highlights.push(`Discrepancias: ${data.discrepancies}`);
          if (data.positions_synced !== undefined) highlights.push(`Posiciones: ${data.positions_synced}`);
          if (data.computed !== undefined) highlights.push(`Calculados: ${data.computed}`);
          if (data.skipped !== undefined) highlights.push(`Omitidos: ${data.skipped}`);
          detail = highlights.length > 0 ? highlights.join(" | ") : "OK";
        } catch {
          detail = responseText.slice(0, 100);
        }
      } else {
        status = "❌";
        detail = `HTTP ${httpCode}: ${responseText.slice(0, 200)}`;
      }
    } catch (e) {
      status = "❌";
      detail = `Error: ${String(e).slice(0, 200)}`;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const now = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

    // Send Telegram alert
    if (telegramToken && chatId) {
      const message = [
        `${status} *${jobName}*`,
        `⏱ ${elapsed}s | ${now}`,
        detail ? `📋 ${detail}` : "",
      ].filter(Boolean).join("\n");

      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      }).catch((e) => console.error("Telegram send failed:", e));
    }

    return new Response(JSON.stringify({ ok: true, status, detail, elapsed_s: elapsed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("job-monitor error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
