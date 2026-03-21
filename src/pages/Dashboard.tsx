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
import { formatCurrency } from "@/lib/mockData";
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
    if (opError) toast.error(opError);
    else toast.success(t.operator.operatorCycleComplete);
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
    <div className="p-3 md:p-6 space-y-4 md:space-y-5 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-foreground">{t.operator.title}</h1>
          <p className="text-[10px] md:text-xs text-muted-foreground font-mono">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            <span className="text-primary ml-2">● {goal.automation_level.toUpperCase()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cooldownActive && <StatusBadge variant="loss" dot>{t.operator.cooldown}</StatusBadge>}
          {dailyCapReached && <StatusBadge variant="warning" dot>{t.operator.cap}</StatusBadge>}
          <button
            onClick={() => phase === 'post_market' ? getDailyReview() : getPreMarket()}
            disabled={coachLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border hover:bg-accent/50 transition-colors text-muted-foreground"
          >
            {coachLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : phase === 'post_market' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            {phase === 'post_market' ? t.operator.review : t.operator.briefing}
          </button>
          <button
            onClick={handleRunOperator}
            disabled={opLoading || cooldownActive || dailyCapReached}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all",
              cooldownActive || dailyCapReached
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
            )}
          >
            {opLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t.operator.run}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {operatorStatus?.preflight_warnings && operatorStatus.preflight_warnings.length > 0 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 space-y-1">
          {operatorStatus.preflight_warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono text-loss">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        <MetricCard label={t.nav.portfolio} value={formatCurrency(portfolioValue)}
          change={`${(closedPnl + unrealizedPnl) >= 0 ? '+' : ''}${formatCurrency(closedPnl + unrealizedPnl)}`}
          changeType={(closedPnl + unrealizedPnl) >= 0 ? "positive" : "negative"} icon={DollarSign} />
        <MetricCard label={t.dashboard.today} value={operatorStatus ? `${operatorStatus.today_pnl >= 0 ? '+' : ''}${formatCurrency(operatorStatus.today_pnl)}` : '—'}
          change={`${operatorStatus?.trades_today || 0}/${operatorStatus?.max_trades_per_day || 3} ${t.common.trades}`}
          changeType={(operatorStatus?.today_pnl || 0) >= 0 ? "positive" : "negative"} icon={Activity} />
        <MetricCard label={t.operator.week} value={`${weeklyPnl >= 0 ? '+' : ''}${formatCurrency(weeklyPnl)}`}
          changeType={weeklyPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label={t.operator.month} value={`${monthlyPnl >= 0 ? '+' : ''}${formatCurrency(monthlyPnl)}`}
          change={goalExists ? `/ $${goal.monthly_target.toLocaleString()}` : undefined}
          changeType={monthlyPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label={t.operator.winRate} value={journalStats.total > 0 ? `${winRate.toFixed(0)}%` : '—'}
          change={`${journalStats.total} ${t.common.trades}`} changeType={winRate >= 50 ? "positive" : "negative"} icon={Target} />
        <MetricCard label={t.common.risk} value={`${exposurePct.toFixed(0)}%`}
          change={`DD ${drawdownPct.toFixed(1)}%`}
          changeType={drawdownPct > settings.max_drawdown * 0.8 ? "negative" : "positive"} icon={Shield} />
      </div>

      {/* Risk Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ProgressBar value={operatorStatus?.daily_risk_used || 0} max={settings.max_daily_risk} label={t.riskMgmt.dailyRisk} />
        <ProgressBar value={positions.length} max={settings.max_positions} label={t.riskMgmt.positions} />
        <ProgressBar value={drawdownPct} max={settings.max_drawdown} label={t.riskMgmt.drawdown} />
        <ProgressBar value={operatorStatus?.consecutive_losses || 0} max={settings.loss_cooldown_count} label={t.riskMgmt.lossStreak} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Active Trades */}
        <div className="lg:col-span-2 space-y-4">
          {goalExists && (
            <GoalProgress
              monthlyTarget={goal.monthly_target}
              monthPnl={monthlyPnl}
              dailyTarget={goal.daily_target}
              todayPnl={operatorStatus?.today_pnl || 0}
              tradingDaysPassed={tradingDaysPassed}
            />
          )}

          {/* Active Positions */}
          <div className="terminal-border rounded-lg">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-primary" /> {t.operator.activeTrades}
              </h2>
              <button onClick={() => navigate('/portfolio')} className="text-[10px] font-mono text-primary hover:underline">{t.common.viewAll} →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-2.5">{t.operator.symbol}</th>
                    <th className="text-center p-2.5">{t.operator.dir}</th>
                    <th className="text-right p-2.5">{t.common.entry}</th>
                    <th className="text-right p-2.5">{t.operator.sl}</th>
                    <th className="text-right p-2.5">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground font-mono">{t.operator.noActiveTrades}</td></tr>
                  ) : positions.slice(0, 8).map(pos => {
                    const currentPrice = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
                    const livePnl = currentPrice
                      ? (pos.direction === 'long' ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice) * pos.quantity
                      : pos.pnl || 0;
                    return (
                      <tr key={pos.id} className="border-b border-border/30 hover:bg-accent/20">
                        <td className="p-2.5 font-mono font-medium text-foreground">{pos.symbol}</td>
                        <td className="text-center p-2.5">
                          <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>{pos.direction === 'long' ? '▲' : '▼'}</StatusBadge>
                        </td>
                        <td className="text-right p-2.5 font-mono text-muted-foreground">{formatCurrency(pos.avg_entry)}</td>
                        <td className="text-right p-2.5 font-mono text-loss/70">{pos.stop_loss ? formatCurrency(pos.stop_loss) : '—'}</td>
                        <td className={cn("text-right p-2.5 font-mono font-bold", livePnl >= 0 ? "text-profit" : "text-loss")}>
                          {livePnl >= 0 ? '+' : ''}{formatCurrency(livePnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Last Run Result */}
          {runResult && (
            <div className="terminal-border rounded-lg p-3">
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2 mb-3">
                <Zap className="h-3.5 w-3.5 text-primary" /> {t.operator.lastRun}
                <StatusBadge variant={runResult.status === 'executed' ? 'profit' : runResult.status === 'blocked' ? 'loss' : 'info'}>
                  {runResult.status.toUpperCase()}
                </StatusBadge>
              </h2>
              {runResult.reasons && runResult.reasons.length > 0 && (
                <div className="space-y-1 mb-3">
                  {runResult.reasons.map((r, i) => <div key={i} className="text-[10px] font-mono text-loss">{r}</div>)}
                </div>
              )}
              {runResult.trades && runResult.trades.length > 0 ? (
                <div className="space-y-2">
                  {runResult.trades.map((trd, i) => (
                    <div key={i} className="bg-accent/30 rounded-md p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-foreground">{trd.symbol}</span>
                        <StatusBadge variant={trd.direction === 'long' ? 'profit' : 'loss'}>{trd.direction === 'long' ? t.common.long : t.common.short}</StatusBadge>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                        <span>{t.common.score}: <strong className="text-foreground">{trd.score}</strong></span>
                        <span>R: <strong className="text-foreground">{trd.expected_r}</strong></span>
                        <span>{t.common.risk}: <strong className="text-foreground">{trd.risk_pct}%</strong></span>
                      </div>
                      {runResult.execution && runResult.execution[i] && (
                        <div className="flex items-center gap-1 text-[10px] font-mono">
                          {runResult.execution[i].success ? (
                            <><CheckCircle className="h-3 w-3 text-profit" /><span className="text-profit">{t.operator.executed}</span></>
                          ) : (
                            <><XCircle className="h-3 w-3 text-loss" /><span className="text-loss">{runResult.execution[i].error || t.operator.failed}</span></>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : runResult.status === 'no_opportunities' ? (
                <p className="text-[10px] font-mono text-muted-foreground">{runResult.message || t.operator.noQualitySignals}</p>
              ) : null}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <DailyRoutine
            phase={phase}
            tradesToday={operatorStatus?.trades_today || 0}
            maxTrades={operatorStatus?.max_trades_per_day || 3}
            riskUsed={operatorStatus?.daily_risk_used || 0}
            maxRisk={settings.max_daily_risk}
            cooldownActive={cooldownActive}
          />

          <CoachingPanel
            grade={coachResult?.grade}
            message={coachResult?.message}
            mistakes={coachResult?.mistakes}
            suggestions={coachResult?.suggestions}
            loading={coachLoading}
          />

          {/* Performance Summary */}
          <div className="terminal-border rounded-lg p-3">
            <h2 className="text-xs font-bold text-foreground flex items-center gap-2 mb-3">
              <Target className="h-3.5 w-3.5 text-primary" /> {t.operator.performance}
            </h2>
            <div className="space-y-2 text-xs">
              {[
                { label: t.operator.totalPnl, value: `${closedPnl >= 0 ? '+' : ''}${formatCurrency(closedPnl)}`, ok: closedPnl >= 0 },
                { label: t.operator.openPnl, value: `${unrealizedPnl >= 0 ? '+' : ''}${formatCurrency(unrealizedPnl)}`, ok: unrealizedPnl >= 0 },
                { label: t.operator.winRate, value: journalStats.total > 0 ? `${winRate.toFixed(0)}%` : '—', ok: winRate >= 50 },
                { label: t.operator.avgR, value: journalStats.avgR !== 0 ? `${journalStats.avgR >= 0 ? '+' : ''}${journalStats.avgR.toFixed(2)}R` : '—', ok: journalStats.avgR >= 0 },
                { label: t.riskMgmt.drawdown, value: `${drawdownPct.toFixed(1)}%`, ok: drawdownPct < settings.max_drawdown * 0.8 },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className={cn("font-mono font-medium", item.ok ? "text-foreground" : "text-loss")}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goal Setup Link */}
          <button
            onClick={() => setShowGoalSetup(!showGoalSetup)}
            className="w-full text-[10px] font-mono text-center py-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            {showGoalSetup ? t.operator.hideGoalSetup : goalExists ? t.operator.editGoal : t.operator.setGoal}
          </button>

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => navigate('/portfolio')} className="text-[10px] font-mono text-center py-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground">
              {t.nav.portfolio} →
            </button>
            <button onClick={() => navigate('/signals')} className="text-[10px] font-mono text-center py-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground">
              {t.nav.signals} →
            </button>
          </div>
        </div>
      </div>

      {showGoalSetup && (
        <div className="max-w-2xl mx-auto">
          <GoalSetup onComplete={() => setShowGoalSetup(false)} />
        </div>
      )}
    </div>
  );
}