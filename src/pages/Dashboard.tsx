import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play, Loader2, AlertTriangle,
  Briefcase, Target, Shield, Activity, TrendingUp,
} from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import GoalSetup from "@/components/operator/GoalSetup";
import CapitalLedger from "@/components/dashboard/CapitalLedger";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { useOperatorMode } from "@/hooks/useOperatorMode";
import { useGoalProfile } from "@/hooks/useGoalProfile";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useKellyStats } from "@/hooks/useKellyStats";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useMarketData } from "@/hooks/useMarketData";
import { toast } from "sonner";

function SectionError({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded font-mono">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      Error loading {label}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="px-4 py-6 flex items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { settings } = useUserSettings();
  const { goal, exists: goalExists, loading: goalLoading } = useGoalProfile();
  const navigate = useNavigate();
  const { data: marketAssets } = useMarketData();
  const { status: operatorStatus, loading: opLoading, error: opError, fetchStatus, runOperator } = useOperatorMode();
  const [showGoalSetup, setShowGoalSetup] = useState(false);
  const { data: kellyStats } = useKellyStats();

  // Build kelly map: symbol → kelly_pct
  const kellyMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!kellyStats) return map;
    for (const s of kellyStats) {
      map.set(s.symbol, s.kelly_pct);
      map.set(s.symbol.replace("/", ""), s.kelly_pct);
    }
    return map;
  }, [kellyStats]);

  // ── Data from react-query (independent queries) ──
  const {
    positions, positionsLoading, positionsError,
    closedPnl,
    journalStats, journalLoading, journalError,
    activeSignals, signalsLoading,
    dataFreshness,
    refetchSignals,
  } = useDashboardData(user?.id, settings.paper_trading);

  // ── Price map ──
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!marketAssets) return map;
    for (const asset of marketAssets) {
      map.set(asset.symbol, asset.price);
      map.set(asset.symbol.replace("/", ""), asset.price);
    }
    return map;
  }, [marketAssets]);

  // ── Metrics ──
  const metrics = useDashboardMetrics({
    positions, closedPnl, journalStats, settings, priceMap, operatorStatus,
  });

  // ── Operator run ──
  const handleRunOperator = useCallback(async () => {
    await runOperator(true);
    if (opError) {
      toast.error(opError);
    } else {
      toast.success(t.operator.operatorCycleComplete);
      try {
        await supabase.functions.invoke("alpaca-sync", { body: { paper: settings.paper_trading } });
        toast.success("Positions synced with Alpaca");
      } catch {
        toast.info("Run manual sync if positions don't update");
      }
      refetchSignals();
    }
  }, [runOperator, opError, t, refetchSignals]);

  // ── Goal setup guard ──
  if (!goalLoading && !goalExists && !showGoalSetup) {
    return (
      <div className="p-3 md:p-6 space-y-4 animate-slide-in max-w-2xl mx-auto">
        <div className="text-center space-y-2 mb-6">
          <Target className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{t.operator.welcomeTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.operator.welcomeDesc}</p>
        </div>
        <GoalSetup onComplete={() => setShowGoalSetup(false)} />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-5 space-y-4 animate-slide-in">
      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase",
            metrics.cooldownActive ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" :
            metrics.dailyCapReached ? "bg-red-500/10 text-red-400 border border-red-500/30" :
            "bg-green-500/10 text-green-400 border border-green-500/30"
          )}>
            {metrics.cooldownActive ? "COOLDOWN" : metrics.dailyCapReached ? "CAP REACHED" : "ACTIVE"}
          </span>
          {(settings as any)?.shadow_mode && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30">
              SHADOW
            </span>
          )}
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider hidden sm:inline">
            {goal?.automation_level === "full_operator" ? "● AUTO" : "○ GUIDED"}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {positions.length}/{metrics.maxTradesPerDay} pos
          </span>
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            · Risk: {metrics.displayRiskUsed.toFixed(1)}%/{metrics.displayMaxRisk}%
          </span>
          {operatorStatus?.vix != null && (
            <span className={cn(
              "text-[9px] font-mono uppercase tracking-wider hidden sm:inline",
              operatorStatus.vix > 30 ? "text-red-400" :
              operatorStatus.vix > 20 ? "text-yellow-400" : "text-green-400/60"
            )}>
              VIX {operatorStatus.vix.toFixed(0)}
              {operatorStatus.thresholds?.adjustment_reason !== "normal" &&
                ` (${operatorStatus.thresholds?.adjustment_reason?.replace(/_/g, " ")})`
              }
            </span>
          )}
          {dataFreshness !== null && (
            <span className={cn(
              "text-[9px] font-mono uppercase tracking-wider hidden sm:inline",
              dataFreshness.fresh ? "text-green-400/60" : "text-red-400"
            )}>
              {dataFreshness.fresh ? `● ${dataFreshness.symbol_count}s` : "⚠ STALE"}
            </span>
          )}
        </div>
        <button
          onClick={handleRunOperator}
          disabled={opLoading || metrics.cooldownActive || metrics.dailyCapReached}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium transition-all",
            opLoading ? "opacity-50 cursor-not-allowed" :
            (metrics.cooldownActive || metrics.dailyCapReached) ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground" :
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {opLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {opLoading ? t.common.running : t.dashboard.runOperator}
        </button>
      </div>

      {/* ── Preflight Warnings ── */}
      {operatorStatus?.preflight_warnings && operatorStatus.preflight_warnings.length > 0 && (
        <div className="space-y-1">
          {operatorStatus.preflight_warnings.map((w, i) => (
            <div key={i} className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-1.5 font-mono">{w}</div>
          ))}
        </div>
      )}

      {/* ── 3 KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label={t.dashboard.portfolioValue} value={formatCurrency(metrics.portfolioValue)} icon={Briefcase} />
        <MetricCard
          label={t.dashboard.todayPnl}
          value={`${(operatorStatus?.today_pnl ?? 0) >= 0 ? "+" : ""}${formatCurrency(operatorStatus?.today_pnl ?? 0)}`}
          changeType={(operatorStatus?.today_pnl ?? 0) >= 0 ? "positive" : "negative"}
          icon={Activity}
        />
        <MetricCard
          label={t.dashboard.openPnl}
          value={`${metrics.unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(metrics.unrealizedPnl)}`}
          changeType={metrics.unrealizedPnl >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <MetricCard
          label={t.dashboard.drawdown}
          value={`${metrics.drawdownPct.toFixed(1)}%`}
          changeType={metrics.drawdownPct > 5 ? "negative" : "neutral"}
          icon={Shield}
        />
      </div>

      {/* ── Open Positions ── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Open Positions</span>
          {positions.length > 5 && (
            <button onClick={() => navigate("/portfolio")} className="text-xs text-primary hover:underline font-mono">
              +{positions.length - 5} more →
            </button>
          )}
        </div>
        {positionsError ? (
          <SectionError label="positions" />
        ) : positionsLoading ? (
          <SectionSkeleton />
        ) : positions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground font-mono">No open positions</div>
        ) : (
          <div className="divide-y divide-border">
            {positions.slice(0, 5).map((pos) => {
              const currentPrice = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace("/", ""));
              const qty = Math.abs(pos.quantity);
              const livePnl = currentPrice
                ? (pos.direction === "long" ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice) * qty
                : null;
              const pnl = livePnl ?? pos.pnl ?? 0;
              const kelly = kellyMap.get(pos.symbol) ?? kellyMap.get(pos.symbol.replace("/", ""));
              return (
                <div key={pos.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{pos.symbol}</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono uppercase",
                      pos.direction === "long" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    )}>{pos.direction}</span>
                    {kelly !== undefined && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-mono",
                        kelly >= 8 ? "bg-primary/10 text-primary" :
                        kelly >= 4 ? "bg-yellow-500/10 text-yellow-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        K:{kelly.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground font-mono">
                    <span className="hidden sm:inline">Entry: {formatCurrency(pos.avg_entry)}</span>
                    {pos.stop_loss && <span className="hidden sm:inline text-destructive/70">SL: {formatCurrency(pos.stop_loss)}</span>}
                    <span className={cn("font-medium", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                      {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Active Signals ── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Active Signals</span>
          <button onClick={() => navigate("/trade-ideas")} className="text-xs text-primary hover:underline font-mono">
            View all →
          </button>
        </div>
        {signalsLoading ? (
          <SectionSkeleton />
        ) : activeSignals.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground font-mono">
            No active signals — run operator to generate
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeSignals.map((sig) => (
              <div key={sig.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">{sig.asset}</span>
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono uppercase",
                    sig.direction === "long" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  )}>{sig.direction}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-muted-foreground">
                  <span>Score: <span className="text-foreground">{sig.opportunity_score.toFixed(0)}</span></span>
                  <span>R: <span className="text-foreground">{sig.expected_r_multiple.toFixed(1)}</span></span>
                  <button
                    onClick={() => navigate("/trade-ideas")}
                    className="px-2 py-1 rounded border border-border hover:bg-accent text-[10px] text-primary hover:text-primary-foreground hover:bg-primary transition-colors"
                  >
                    Approve →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Capital Ledger ── */}
      <CapitalLedger />

      {/* ── Journal error banner (non-blocking) ── */}
      {journalError && <SectionError label="trade journal" />}
    </div>
  );
}
