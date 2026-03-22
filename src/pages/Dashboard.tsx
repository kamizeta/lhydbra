import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, TrendingUp, Shield, Activity,
  AlertTriangle, Play, Loader2, CheckCircle, XCircle,
  Briefcase, Target, Zap, Sun, Moon,
} from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import ProgressBar from "@/components/shared/ProgressBar";
import GoalSetup from "@/components/operator/GoalSetup";
import GoalProgress from "@/components/operator/GoalProgress";
import CoachingPanel from "@/components/operator/CoachingPanel";
import DailyRoutine from "@/components/operator/DailyRoutine";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { useOperatorMode } from "@/hooks/useOperatorMode";
import { useGoalProfile } from "@/hooks/useGoalProfile";
import { usePerformanceCoach } from "@/hooks/usePerformanceCoach";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useMarketData } from "@/hooks/useMarketData";
import { toast } from "sonner";

interface Position {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  pnl: number | null;
  opened_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { settings } = useUserSettings();
  const { goal, exists: goalExists, loading: goalLoading } = useGoalProfile();
  const { result: coachResult, loading: coachLoading, getPreMarket, getDailyReview } = usePerformanceCoach();
  const navigate = useNavigate();
  const { data: marketAssets } = useMarketData();
  const { status: operatorStatus, runResult, loading: opLoading, error: opError, fetchStatus, runOperator } = useOperatorMode();
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedPnl, setClosedPnl] = useState(0);
  const [weeklyPnl, setWeeklyPnl] = useState(0);
  const [monthlyPnl, setMonthlyPnl] = useState(0);
  const [journalStats, setJournalStats] = useState({ total: 0, wins: 0, avgR: 0 });
  const [showGoalSetup, setShowGoalSetup] = useState(false);
  const [activeSignals, setActiveSignals] = useState<Array<{
    id: string; asset: string; direction: string;
    opportunity_score: number; expected_r_multiple: number;
    confidence_score: number;
  }>>([]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    Promise.all([
      supabase.from('positions').select('id, symbol, direction, quantity, avg_entry, stop_loss, take_profit, strategy, pnl, opened_at').eq('user_id', user.id).eq('status', 'open').order('opened_at', { ascending: false }),
      supabase.from('positions').select('pnl').eq('user_id', user.id).eq('status', 'closed'),
      supabase.from('trade_journal').select('pnl, r_multiple').eq('user_id', user.id).gte('entered_at', weekAgo),
      supabase.from('trade_journal').select('pnl, r_multiple').eq('user_id', user.id).gte('entered_at', monthAgo),
      supabase.from('trade_journal').select('pnl, r_multiple').eq('user_id', user.id),
    ]).then(([posRes, closedRes, weekRes, monthRes, allRes]) => {
      setPositions((posRes.data || []) as Position[]);
      setClosedPnl((closedRes.data || []).reduce((s, p) => s + (p.pnl || 0), 0));
      setWeeklyPnl((weekRes.data || []).reduce((s, t) => s + (t.pnl || 0), 0));
      setMonthlyPnl((monthRes.data || []).reduce((s, t) => s + (t.pnl || 0), 0));
      const all = (allRes.data || []) as { pnl: number | null; r_multiple: number | null }[];
      const wins = all.filter(t => (t.pnl || 0) > 0).length;
      const rTrades = all.filter(t => t.r_multiple != null);
      setJournalStats({
        total: all.length, wins,
        avgR: rTrades.length > 0 ? rTrades.reduce((s, t) => s + (t.r_multiple || 0), 0) / rTrades.length : 0,
      });
    });
    fetchStatus();
  }, [user, fetchStatus]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-operator')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => {
        supabase.from('positions').select('id, symbol, direction, quantity, avg_entry, stop_loss, take_profit, strategy, pnl, opened_at').eq('user_id', user.id).eq('status', 'open').order('opened_at', { ascending: false })
          .then(({ data }) => setPositions((data || []) as Position[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from('signals')
      .select('id, asset, direction, opportunity_score, expected_r_multiple, confidence_score')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('opportunity_score', { ascending: false })
      .limit(3)
      .then(({ data }) => setActiveSignals(data || []));
  }, [user]);

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!marketAssets) return map;
    for (const asset of marketAssets) {
      map.set(asset.symbol, asset.price);
      map.set(asset.symbol.replace('/', ''), asset.price);
    }
    return map;
  }, [marketAssets]);

  const unrealizedPnl = useMemo(() => {
    let total = 0;
    for (const pos of positions) {
      const currentPrice = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
      if (!currentPrice) continue;
      const diff = pos.direction === 'long' ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice;
      total += diff * pos.quantity;
    }
    return total;
  }, [positions, priceMap]);

  const portfolioValue = settings.current_capital + closedPnl + unrealizedPnl;
  const totalExposure = positions.reduce((sum, p) => sum + (p.quantity * p.avg_entry), 0);
  const exposurePct = portfolioValue > 0 ? (totalExposure / portfolioValue) * 100 : 0;
  const winRate = journalStats.total > 0 ? (journalStats.wins / journalStats.total) * 100 : 0;
  const drawdownPct = settings.initial_capital > 0 ? Math.max(0, ((settings.initial_capital - portfolioValue) / settings.initial_capital) * 100) : 0;

  const handleRunOperator = async () => {
    await runOperator(true);
    if (opError) {
      toast.error(opError);
    } else {
      toast.success(t.operator.operatorCycleComplete);
      try {
        await supabase.functions.invoke('alpaca-sync', { body: { paper: true } });
        toast.success("Positions synced with Alpaca");
      } catch {
        toast.info("Run manual sync if positions don't update");
      }
      supabase.from('signals')
        .select('id, asset, direction, opportunity_score, expected_r_multiple, confidence_score')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('opportunity_score', { ascending: false })
        .limit(3)
        .then(({ data }) => setActiveSignals(data || []));
    }
  };

  const cooldownActive = operatorStatus?.cooldown_active || false;
  const dailyCapReached = (operatorStatus?.trades_today || 0) >= (operatorStatus?.max_trades_per_day || 3);

  const hour = new Date().getHours();
  const phase: 'pre_market' | 'market_open' | 'post_market' =
    hour < 9 ? 'pre_market' : hour < 16 ? 'market_open' : 'post_market';

  const tradingDaysPassed = Math.floor(new Date().getDate() * 22 / 30);

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
            cooldownActive ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" :
            dailyCapReached ? "bg-red-500/10 text-red-400 border border-red-500/30" :
            "bg-green-500/10 text-green-400 border border-green-500/30"
          )}>
            {cooldownActive ? "COOLDOWN" : dailyCapReached ? "CAP REACHED" : "ACTIVE"}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {operatorStatus?.trades_today ?? 0}/{operatorStatus?.max_trades_per_day ?? 3} trades
          </span>
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            · Risk: {operatorStatus?.daily_risk_used?.toFixed(1) ?? '0.0'}%/{operatorStatus?.max_daily_risk ?? 3}%
          </span>
        </div>
        <button
          onClick={handleRunOperator}
          disabled={opLoading || cooldownActive || dailyCapReached}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium transition-all",
            opLoading ? "opacity-50 cursor-not-allowed" :
            (cooldownActive || dailyCapReached) ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground" :
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {opLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {opLoading ? "Running..." : "Run Operator"}
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
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Portfolio"
          value={formatCurrency(portfolioValue)}
          icon={Briefcase}
        />
        <MetricCard
          label="Today P&L"
          value={`${(operatorStatus?.today_pnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(operatorStatus?.today_pnl ?? 0)}`}
          changeType={(operatorStatus?.today_pnl ?? 0) >= 0 ? "positive" : "negative"}
          icon={Activity}
        />
        <MetricCard
          label="Drawdown"
          value={`${drawdownPct.toFixed(1)}%`}
          changeType={drawdownPct > 5 ? "negative" : "neutral"}
          icon={Shield}
        />
      </div>

      {/* ── Open Positions ── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Open Positions</span>
          {positions.length > 5 && (
            <button onClick={() => navigate('/positions')} className="text-xs text-primary hover:underline font-mono">
              +{positions.length - 5} more →
            </button>
          )}
        </div>
        {positions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground font-mono">No open positions</div>
        ) : (
          <div className="divide-y divide-border">
            {positions.slice(0, 5).map((pos) => {
              const currentPrice = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
              const pnl = currentPrice
                ? (pos.direction === 'long' ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice) * pos.quantity
                : pos.pnl ?? 0;
              return (
                <div key={pos.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{pos.symbol}</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono uppercase",
                      pos.direction === 'long' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    )}>{pos.direction}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground font-mono">
                    <span>Entry: {formatCurrency(pos.avg_entry)}</span>
                    {pos.stop_loss && <span className="hidden sm:inline text-destructive/70">SL: {formatCurrency(pos.stop_loss)}</span>}
                    <span className={cn("font-medium", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
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
          <button onClick={() => navigate('/trade-ideas')} className="text-xs text-primary hover:underline font-mono">
            View all →
          </button>
        </div>
        {activeSignals.length === 0 ? (
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
                    sig.direction === 'long' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  )}>{sig.direction}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-muted-foreground">
                  <span>Score: <span className="text-foreground">{sig.opportunity_score.toFixed(0)}</span></span>
                  <span>R: <span className="text-foreground">{sig.expected_r_multiple.toFixed(1)}</span></span>
                  <button
                    onClick={() => navigate('/trade-ideas')}
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
    </div>
  );
}