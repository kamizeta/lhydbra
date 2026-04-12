import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, reason: "no bot token" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine summary type from body or default based on UTC hour
    let summaryType = "morning";
    try {
      const body = await req.json();
      if (body?.type) summaryType = body.type;
    } catch {
      const hour = new Date().getUTCHours();
      summaryType = hour < 15 ? "morning" : "afternoon";
    }

    // Get all users with telegram configured
    const { data: allSettings } = await supabase
      .from("user_settings")
      .select("user_id, notify_telegram_chat_id, current_capital, initial_capital, daily_risk_used, trades_today, max_daily_risk, max_positions, risk_per_trade")
      .not("notify_telegram_chat_id", "is", null);

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no users with telegram" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;

    for (const settings of allSettings) {
      if (!settings.notify_telegram_chat_id) continue;

      const userId = settings.user_id;

      // Fetch open positions
      const { data: positions } = await supabase
        .from("positions")
        .select("symbol, direction, quantity, avg_entry, stop_loss, take_profit, pnl, strategy, asset_type")
        .eq("user_id", userId)
        .eq("status", "open");

      // Fetch today's closed trades
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: closedToday } = await supabase
        .from("trade_journal")
        .select("symbol, direction, pnl, r_multiple, strategy_family")
        .eq("user_id", userId)
        .gte("exited_at", todayStart.toISOString());

      // Fetch active signals
      const { data: activeSignals } = await supabase
        .from("signals")
        .select("asset, direction, opportunity_score, expected_r_multiple, strategy_family")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("opportunity_score", { ascending: false })
        .limit(5);

      // Fetch today's daily_performance
      const todayStr = todayStart.toISOString().split("T")[0];
      const { data: dailyPerf } = await supabase
        .from("daily_performance")
        .select("realized_pnl, unrealized_pnl, trades_opened, trades_closed, win_count, loss_count")
        .eq("user_id", userId)
        .eq("date", todayStr)
        .maybeSingle();

      // Calculate metrics
      const openPositions = positions || [];
      const closedTrades = closedToday || [];
      const signals = activeSignals || [];

      const totalExposure = openPositions.reduce((s, p) => s + Math.abs(Number(p.quantity)) * Number(p.avg_entry), 0);
      const totalOpenRisk = openPositions.reduce((s, p) => {
        if (!p.stop_loss) return s;
        return s + Math.abs(Number(p.avg_entry) - Number(p.stop_loss)) * Math.abs(Number(p.quantity));
      }, 0);

      const closedPnl = closedTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
      const winCount = closedTrades.filter(t => (Number(t.pnl) || 0) > 0).length;
      const lossCount = closedTrades.filter(t => (Number(t.pnl) || 0) < 0).length;

      const capital = Number(settings.current_capital) || 0;
      const initialCapital = Number(settings.initial_capital) || 0;
      const drawdown = initialCapital > 0 ? ((initialCapital - capital) / initialCapital * 100) : 0;
      const exposurePct = capital > 0 ? (totalExposure / capital * 100) : 0;
      const riskPct = capital > 0 ? (totalOpenRisk / capital * 100) : 0;

      // Build message
      const isMorning = summaryType === "morning";
      const emoji = isMorning ? "☀️" : "📊";
      const title = isMorning ? "BRIEFING PRE-MARKET" : "RESUMEN DE CIERRE";
      const time = isMorning ? "5:30 AM COT" : "2:00 PM COT";

      const lines: string[] = [
        `${emoji} *${title}*`,
        `📅 ${new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Bogota" })}`,
        "",
        "💰 *CAPITAL*",
        `• Capital actual: $${capital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `• Drawdown: ${drawdown.toFixed(1)}%`,
        `• Exposición: $${totalExposure.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${exposurePct.toFixed(1)}%)`,
        `• Riesgo abierto: $${totalOpenRisk.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${riskPct.toFixed(1)}%)`,
      ];

      // Open positions section
      lines.push("", `📈 *POSICIONES ABIERTAS (${openPositions.length})*`);
      if (openPositions.length === 0) {
        lines.push("• Sin posiciones abiertas");
      } else {
        for (const p of openPositions) {
          const dir = p.direction === "long" ? "🟢 LONG" : "🔴 SHORT";
          const qty = Math.abs(Number(p.quantity));
          const entry = Number(p.avg_entry).toFixed(2);
          const sl = p.stop_loss ? `SL: $${Number(p.stop_loss).toFixed(2)}` : "⚠️ Sin SL";
          const riskPerUnit = p.stop_loss ? Math.abs(Number(p.avg_entry) - Number(p.stop_loss)) : 0;
          const posRisk = riskPerUnit * qty;
          lines.push(`• \`${p.symbol}\` ${dir} × ${qty} @ $${entry} | ${sl} | Riesgo: $${posRisk.toFixed(0)}`);
        }
      }

      // Today's closed trades
      if (closedTrades.length > 0 || !isMorning) {
        lines.push("", `📋 *TRADES CERRADOS HOY (${closedTrades.length})*`);
        if (closedTrades.length === 0) {
          lines.push("• Sin trades cerrados hoy");
        } else {
          for (const t of closedTrades) {
            const pnl = Number(t.pnl) || 0;
            const pnlEmoji = pnl >= 0 ? "✅" : "❌";
            const rMult = t.r_multiple ? ` (${Number(t.r_multiple).toFixed(1)}R)` : "";
            lines.push(`• ${pnlEmoji} \`${t.symbol}\` ${t.direction.toUpperCase()}: $${pnl.toFixed(2)}${rMult}`);
          }
          lines.push(`• *Total P&L cerrado: $${closedPnl.toFixed(2)}* | W:${winCount} L:${lossCount}`);
        }
      }

      // Signals (morning only)
      if (isMorning && signals.length > 0) {
        lines.push("", "🎯 *TOP SEÑALES ACTIVAS*");
        for (const s of signals) {
          const dir = s.direction === "long" ? "⬆️" : "⬇️";
          lines.push(`• ${dir} \`${s.asset}\` Score: ${Number(s.opportunity_score).toFixed(0)} | R: ${Number(s.expected_r_multiple).toFixed(1)} | ${s.strategy_family || "—"}`);
        }
      }

      // Daily risk status
      lines.push("", "⚙️ *ESTADO DEL SISTEMA*");
      lines.push(`• Riesgo diario usado: ${Number(settings.daily_risk_used || 0).toFixed(1)}% / ${settings.max_daily_risk}%`);
      lines.push(`• Trades hoy: ${settings.trades_today || 0}`);
      lines.push(`• Posiciones: ${openPositions.length} / ${settings.max_positions}`);

      if (isMorning) {
        lines.push("", "🔔 _Buen día de trading. Sigue el plan._");
      } else {
        lines.push("", "🔔 _Cierre de sesión. Revisa el journal._");
      }

      const message = lines.join("\n");

      // Send via Telegram
      const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: settings.notify_telegram_chat_id,
          text: message,
          parse_mode: "Markdown",
        }),
      });

      if (!tgResponse.ok) {
        const err = await tgResponse.text();
        console.error(`Telegram failed for user ${userId}:`, tgResponse.status, err);
      } else {
        sentCount++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, type: summaryType }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("telegram-daily-summary error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});