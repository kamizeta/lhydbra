import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, TrendingUp, TrendingDown, Shield, Activity, PieChart,
  AlertTriangle, Zap, Bot, Lock, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import ProgressBar from "@/components/shared/ProgressBar";
import OnboardingTutorial from "@/components/OnboardingTutorial";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useMarketData } from "@/hooks/useMarketData";

interface DBPosition {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  status: string;
  pnl: number | null;
}

interface DBTradeSignal {
  id: string;
  symbol: string;
  name: string;
  direction: string;
  strategy: string;
  risk_reward: number;
  confidence: number;
  status: string;
}

interface DBAgentAnalysis {
  id: string;
  agent_type: string;
  content: string;
  created_at: string;
}

const AGENT_LABELS: Record<string, string> = {
  'market-analyst': 'Market Analyst',
  'asset-selector': 'Asset Selector',
  'strategy-engine': 'Strategy Engine',
  'risk-manager': 'Risk Manager',
  'order-preparer': 'Order Preparer',
  'portfolio-manager': 'Portfolio Manager',
  'learning-agent': 'Learning Agent',
};

function getAgentSeverity(agentType: string, content: string): 'info' | 'warning' | 'critical' {
  const lower = content.toLowerCase();
  if (agentType === 'risk-manager' || lower.includes('warning') || lower.includes('advertencia') || lower.includes('riesgo alto') || lower.includes('correlación')) return 'warning';
  if (lower.includes('critical') || lower.includes('crítico') || lower.includes('urgente')) return 'critical';
  return 'info';
}

function extractTitle(content: string): string {
  const headingMatch = content.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].slice(0, 60);
  const firstLine = content.split('\n').find(l => l.trim().length > 10);
  if (firstLine) return firstLine.replace(/[#*_]/g, '').trim().slice(0, 60);
  return 'Análisis';
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const navigate = useNavigate();
  const { data: marketAssets } = useMarketData();
  const [positions, setPositions] = useState<DBPosition[]>([]);
  const [pendingSignals, setPendingSignals] = useState<DBTradeSignal[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<DBAgentAnalysis[]>([]);
  const [closedPositions, setClosedPositions] = useState<{ pnl: number | null }[]>([]);
  const [showRiskDetail, setShowRiskDetail] = useState(false);

  const fetchDashboardData = useMemo(() => {
    if (!user) return () => {};
    return () => {
      Promise.all([
        supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open').order('opened_at', { ascending: false }),
        supabase.from('trade_signals').select('id, symbol, name, direction, strategy, risk_reward, confidence, status').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('agent_analyses').select('id, agent_type, content, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('positions').select('pnl').eq('user_id', user.id).eq('status', 'closed'),
      ]).then(([posRes, sigRes, agentRes, closedRes]) => {
        setPositions((posRes.data as DBPosition[]) || []);
        setPendingSignals((sigRes.data as DBTradeSignal[]) || []);
        setAgentOutputs((agentRes.data as DBAgentAnalysis[]) || []);
        setClosedPositions((closedRes.data as { pnl: number | null }[]) || []);
      });
    };
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Realtime: positions, signals, agent analyses
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_signals', filter: `user_id=eq.${user.id}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_analyses', filter: `user_id=eq.${user.id}` }, () => fetchDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchDashboardData]);

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

  const dateLocale = language === 'es' ? 'es-ES' : language === 'pt' ? 'pt-BR' : language === 'fr' ? 'fr-FR' : 'en-US';

  const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const portfolioValue = settings.current_capital + totalRealizedPnl + unrealizedPnl;
  const pnlPercent = settings.initial_capital > 0 ? ((portfolioValue - settings.initial_capital) / settings.initial_capital) * 100 : 0;

  const totalExposure = positions.reduce((sum, p) => sum + (p.quantity * p.avg_entry), 0);
  const exposurePercent = portfolioValue > 0 ? (totalExposure / portfolioValue) * 100 : 0;
  const dailyRiskUsed = portfolioValue > 0 ? Math.min(exposurePercent * (settings.risk_per_trade / 100), settings.max_daily_risk) : 0;

  const warnings = agentOutputs.filter(a =>
    a.agent_type === 'risk-manager' || getAgentSeverity(a.agent_type, a.content) !== 'info'
  ).slice(0, 5);

  // Risk detail calculations
  const exposureByType: Record<string, number> = {};
  positions.forEach(p => {
    const value = p.quantity * p.avg_entry;
    exposureByType[p.asset_type] = (exposureByType[p.asset_type] || 0) + value;
  });

  let totalRiskDollars = 0;
  positions.forEach(p => {
    if (p.stop_loss) {
      const riskPerUnit = Math.abs(p.avg_entry - Number(p.stop_loss));
      totalRiskDollars += riskPerUnit * p.quantity;
    }
  });
  const totalRiskPct = portfolioValue > 0 ? (totalRiskDollars / portfolioValue) * 100 : 0;
  const leverageUsed = portfolioValue > 0 ? totalExposure / portfolioValue : 0;
  const positionsWithoutSL = positions.filter(p => !p.stop_loss).length;
  const dollarRiskPerTrade = portfolioValue * (settings.risk_per_trade / 100);

  // Alerts from positions
  const riskAlerts: string[] = [];
  if (positions.length >= settings.max_positions) riskAlerts.push(`Max posiciones alcanzado (${positions.length}/${settings.max_positions})`);
  if (positionsWithoutSL > 0 && settings.stop_loss_required) riskAlerts.push(`${positionsWithoutSL} posición(es) sin Stop Loss`);
  if (exposurePercent > 100) riskAlerts.push(`Exposición al ${exposurePercent.toFixed(0)}% — excede capital`);
  if (leverageUsed > settings.max_leverage) riskAlerts.push(`Apalancamiento ${leverageUsed.toFixed(1)}x excede límite ${settings.max_leverage}x`);

  const typeLabels: Record<string, string> = { crypto: 'Crypto', stock: 'Acciones', etf: 'ETFs', forex: 'Forex', commodity: 'Commodities' };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-slide-in">
      <OnboardingTutorial />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-foreground">{t.dashboard.title}</h1>
          <p className="text-[10px] md:text-sm text-muted-foreground font-mono truncate">{new Date().toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge variant="profit" dot><span className="hidden sm:inline">{t.common.marketOpen}</span><span className="sm:hidden">Live</span></StatusBadge>
          {(warnings.length > 0 || riskAlerts.length > 0) && (
            <StatusBadge variant="warning" dot>{warnings.length + riskAlerts.length}</StatusBadge>
          )}
        </div>
      </div>

      {/* Risk Alerts Banner */}
      {riskAlerts.length > 0 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 space-y-1">
          {riskAlerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono text-loss">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <div className="cursor-pointer" onClick={() => navigate('/settings')}>
          <MetricCard label="Portfolio" value={formatCurrency(portfolioValue)} change={`PnL ${totalRealizedPnl >= 0 ? '+' : ''}${formatCurrency(totalRealizedPnl)}`} changeType={totalRealizedPnl + unrealizedPnl >= 0 ? "positive" : "negative"} icon={DollarSign} />
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/portfolio')}>
          <MetricCard label="PnL" value={totalRealizedPnl >= 0 ? `+${formatCurrency(totalRealizedPnl)}` : formatCurrency(totalRealizedPnl)} change={`${pnlPercent >= 0 ? '+' : ''}${formatNumber(pnlPercent)}%`} changeType={totalRealizedPnl >= 0 ? "positive" : "negative"} icon={totalRealizedPnl >= 0 ? TrendingUp : TrendingDown} />
        </div>
        <div className="cursor-pointer relative" onClick={() => setShowRiskDetail(!showRiskDetail)}>
          <MetricCard label="Riesgo" value={`${formatNumber(dailyRiskUsed)}%`} change={`${exposurePercent.toFixed(0)}% exp`} changeType="neutral" icon={Shield} />
          <div className="absolute top-2 right-2 text-muted-foreground">
            {showRiskDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/portfolio')}>
          <MetricCard label="Posiciones" value={`${positions.length}/${settings.max_positions}`} change={`${pendingSignals.length} ideas`} changeType="neutral" icon={Activity} />
        </div>
      </div>

      {/* Collapsible Risk Detail Section */}
      {showRiskDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 terminal-border rounded-lg bg-accent/5 animate-slide-in">
          {/* Risk Meters */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Medidores de Riesgo
            </h3>
            <ProgressBar value={dailyRiskUsed} max={settings.max_daily_risk} label="Riesgo Diario" />
            <ProgressBar value={exposurePercent > 100 ? 100 : exposurePercent} max={100} label="Exposición Total" />
            <ProgressBar value={leverageUsed} max={settings.max_leverage} label="Apalancamiento" />
            <ProgressBar value={positions.length} max={settings.max_positions} label="Posiciones" />
          </div>

          {/* Risk Rules */}
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <Lock className="h-4 w-4 text-primary" /> Reglas
            </h3>
            <div className="space-y-1.5">
              {[
                { label: 'Riesgo/Trade', value: `${settings.risk_per_trade}%`, ok: true },
                { label: 'Max Diario', value: `${settings.max_daily_risk}%`, ok: dailyRiskUsed <= settings.max_daily_risk * 0.8 },
                { label: 'Max Drawdown', value: `${settings.max_drawdown}%`, ok: true },
                { label: 'Max Posiciones', value: `${settings.max_positions}`, ok: positions.length < settings.max_positions },
                { label: 'Max Leverage', value: `${settings.max_leverage}x`, ok: leverageUsed <= settings.max_leverage },
                { label: 'Stop Loss', value: settings.stop_loss_required ? 'Requerido' : 'No', ok: positionsWithoutSL === 0 },
                { label: 'R:R Mínimo', value: `${settings.min_rr_ratio}:1`, ok: true },
              ].map((rule, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-muted-foreground">{rule.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{rule.value}</span>
                    <div className={cn("h-1.5 w-1.5 rounded-full", rule.ok ? "bg-profit" : "bg-loss")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Exposure by Type */}
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" /> Exposición por Mercado
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground"><span>Capital</span><span className="font-mono text-foreground">{formatCurrency(portfolioValue)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Invertido</span><span className="font-mono text-foreground">{formatCurrency(totalExposure)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Riesgo Abierto</span><span className={cn("font-mono", totalRiskPct > settings.max_daily_risk ? "text-loss" : "text-warning")}>{formatCurrency(totalRiskDollars)} ({formatNumber(totalRiskPct)}%)</span></div>
              <div className="flex justify-between text-muted-foreground"><span>$/Trade</span><span className="font-mono text-foreground">{formatCurrency(dollarRiskPerTrade)}</span></div>
              <div className="border-t border-border pt-2 mt-2 space-y-1">
                {Object.entries(exposureByType).map(([type, value]) => {
                  const pct = portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{typeLabels[type] || type}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full", pct > settings.max_single_asset ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="font-mono text-foreground w-12 text-right">{formatNumber(pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Portfolio Positions */}
        <div className="lg:col-span-2 terminal-border rounded-lg cursor-pointer" onClick={() => navigate('/portfolio')}>
          <div className="flex items-center justify-between border-b border-border p-3">
            <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
              <PieChart className="h-3.5 w-3.5 text-primary" />
              Posiciones
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground">{positions.length} abiertas</span>
          </div>
          {/* Mobile: card layout */}
          <div className="md:hidden p-2 space-y-2">
            {positions.length === 0 ? (
              <p className="text-center text-muted-foreground text-[10px] font-mono py-4">Sin posiciones</p>
            ) : positions.map((pos) => (
              <div key={pos.id} className="flex items-center justify-between py-1.5 px-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-xs text-foreground">{pos.symbol}</span>
                  <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>
                    {pos.direction === 'long' ? '▲' : '▼'}
                  </StatusBadge>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">${Number(pos.avg_entry).toFixed(2)}</span>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">{t.common.asset}</th>
                  <th className="text-center p-3">Dir</th>
                  <th className="text-right p-3">Qty</th>
                  <th className="text-right p-3">{t.common.entry}</th>
                  <th className="text-right p-3">{t.common.strategy}</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-xs font-mono">Sin posiciones abiertas</td></tr>
                ) : positions.map((pos) => (
                  <tr key={pos.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-3">
                      <div className="font-mono font-medium text-foreground">{pos.symbol}</div>
                      <div className="text-xs text-muted-foreground">{pos.name}</div>
                    </td>
                    <td className="text-center p-3">
                      <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>
                        {pos.direction.toUpperCase()}
                      </StatusBadge>
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">{pos.quantity}</td>
                    <td className="text-right p-3 font-mono text-foreground">${Number(pos.avg_entry).toFixed(2)}</td>
                    <td className="text-right p-3">
                      <StatusBadge variant="info">{pos.strategy || '—'}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 md:space-y-6">
          {/* Pending Ideas */}
          <div className="terminal-border rounded-lg p-3 space-y-2 cursor-pointer" onClick={() => navigate('/trade-ideas')}>
            <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Ideas
            </h2>
            {pendingSignals.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">Sin ideas pendientes. Ejecuta los agentes para generar nuevas.</p>
            ) : pendingSignals.map((signal) => (
              <div key={signal.id} className="rounded-md bg-accent/50 border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono font-medium text-sm text-foreground">{signal.symbol}</div>
                  <StatusBadge variant={signal.direction === 'long' ? 'profit' : 'loss'}>
                    {signal.direction.toUpperCase()}
                  </StatusBadge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{signal.strategy} • R/R {formatNumber(Number(signal.risk_reward))}</div>
                <div className="mt-1 text-xs font-mono text-muted-foreground">{t.common.confidence}: {signal.confidence}%</div>
              </div>
            ))}
          </div>

          {/* Capital & Risk Summary */}
          <div className="terminal-border rounded-lg p-3 space-y-2 cursor-pointer" onClick={() => navigate('/settings')}>
            <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              Capital
            </h2>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between"><span className="text-muted-foreground">Capital Inicial</span><span className="text-foreground">{formatCurrency(settings.initial_capital)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Capital Actual</span><span className="text-foreground">{formatCurrency(settings.current_capital)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Riesgo/Trade</span><span className="text-warning">{settings.risk_per_trade}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">$ en Riesgo</span><span className="text-loss">{formatCurrency(dollarRiskPerTrade)}</span></div>
            </div>
          </div>

          {/* Alerts */}
          <div className="terminal-border rounded-lg p-3 space-y-2 cursor-pointer" onClick={() => navigate('/agents')}>
            <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Alertas
            </h2>
            {warnings.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">Sin alertas activas</p>
            ) : warnings.slice(0, 3).map((alert) => {
              const severity = getAgentSeverity(alert.agent_type, alert.content);
              return (
                <div key={alert.id} className={cn("rounded-md p-3 border",
                  severity === 'critical' ? "bg-destructive/5 border-destructive/20" :
                  severity === 'warning' ? "bg-warning/5 border-warning/20" : "bg-accent/50 border-border"
                )}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", severity === 'critical' ? 'text-destructive' : 'text-warning')} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{extractTitle(alert.content)}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">
                        {AGENT_LABELS[alert.agent_type] || alert.agent_type} • {new Date(alert.created_at).toLocaleTimeString(dateLocale)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
