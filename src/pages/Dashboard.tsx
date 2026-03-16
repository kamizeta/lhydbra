import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  PieChart,
  AlertTriangle,
  Zap,
  Bot,
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
  // Try to extract first heading or first line
  const headingMatch = content.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].slice(0, 60);
  const firstLine = content.split('\n').find(l => l.trim().length > 10);
  if (firstLine) return firstLine.replace(/[#*_]/g, '').trim().slice(0, 60);
  return 'Análisis';
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useUserSettings();
  const navigate = useNavigate();
  const [positions, setPositions] = useState<DBPosition[]>([]);
  const [pendingSignals, setPendingSignals] = useState<DBTradeSignal[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<DBAgentAnalysis[]>([]);
  const [closedPositions, setClosedPositions] = useState<{ pnl: number | null }[]>([]);

  useEffect(() => {
    if (!user) return;

    // Fetch all real data in parallel
    Promise.all([
      supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false }),
      supabase
        .from('trade_signals')
        .select('id, symbol, name, direction, strategy, risk_reward, confidence, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('agent_analyses')
        .select('id, agent_type, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('positions')
        .select('pnl')
        .eq('user_id', user.id)
        .eq('status', 'closed'),
    ]).then(([posRes, sigRes, agentRes, closedRes]) => {
      setPositions((posRes.data as DBPosition[]) || []);
      setPendingSignals((sigRes.data as DBTradeSignal[]) || []);
      setAgentOutputs((agentRes.data as DBAgentAnalysis[]) || []);
      setClosedPositions((closedRes.data as { pnl: number | null }[]) || []);
    });
  }, [user]);

  const dateLocale = language === 'es' ? 'es-ES' : language === 'pt' ? 'pt-BR' : language === 'fr' ? 'fr-FR' : 'en-US';

  // Compute real metrics
  const portfolioValue = settings.current_capital;
  const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const pnlPercent = settings.initial_capital > 0 ? ((portfolioValue - settings.initial_capital) / settings.initial_capital) * 100 : 0;

  // Real risk calculations from positions
  const totalExposure = positions.reduce((sum, p) => sum + (p.quantity * p.avg_entry), 0);
  const exposurePercent = portfolioValue > 0 ? (totalExposure / portfolioValue) * 100 : 0;
  const dailyRiskUsed = portfolioValue > 0 ? Math.min(exposurePercent * (settings.risk_per_trade / 100), settings.max_daily_risk) : 0;

  // Warnings from agent analyses (risk-related)
  const warnings = agentOutputs.filter(a =>
    a.agent_type === 'risk-manager' ||
    getAgentSeverity(a.agent_type, a.content) !== 'info'
  ).slice(0, 5);

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <OnboardingTutorial />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">{t.dashboard.subtitle} • {new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant="profit" dot>{t.common.marketOpen}</StatusBadge>
          {warnings.length > 0 && (
            <button onClick={() => navigate('/risk')} className="cursor-pointer">
              <StatusBadge variant="warning" dot>{warnings.length} {t.dashboard.activeAlerts}</StatusBadge>
            </button>
          )}
        </div>
      </div>

      {/* Top metrics - clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cursor-pointer" onClick={() => navigate('/settings')}>
          <MetricCard
            label={t.dashboard.portfolioValue}
            value={formatCurrency(portfolioValue)}
            change={`Capital inicial: ${formatCurrency(settings.initial_capital)}`}
            changeType="neutral"
            icon={DollarSign}
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/journal')}>
          <MetricCard
            label={t.dashboard.dailyPnl}
            value={totalRealizedPnl >= 0 ? `+${formatCurrency(totalRealizedPnl)}` : formatCurrency(totalRealizedPnl)}
            change={`${pnlPercent >= 0 ? '+' : ''}${formatNumber(pnlPercent)}% total`}
            changeType={totalRealizedPnl >= 0 ? "positive" : "negative"}
            icon={totalRealizedPnl >= 0 ? TrendingUp : TrendingDown}
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/risk')}>
          <MetricCard
            label={t.dashboard.riskUsed}
            value={`${formatNumber(dailyRiskUsed)}%`}
            change={`${settings.max_daily_risk}% ${t.dashboard.ofDailyLimit}`}
            changeType="neutral"
            icon={Shield}
            subtitle={`Exposición: ${formatCurrency(totalExposure)}`}
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/positions')}>
          <MetricCard
            label={t.dashboard.activePositions}
            value={`${positions.length}`}
            change={`${pendingSignals.length} ${t.dashboard.pendingIdeas}`}
            changeType="neutral"
            icon={Activity}
            subtitle={`${t.dashboard.max}: ${settings.max_positions}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Positions */}
        <div className="lg:col-span-2 terminal-border rounded-lg cursor-pointer" onClick={() => navigate('/positions')}>
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              {t.dashboard.openPositions}
            </h2>
            <span className="text-xs font-mono text-muted-foreground">{positions.length} {t.common.active}</span>
          </div>
          <div className="overflow-x-auto">
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
                        {pos.direction === 'long' ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                        {' '}{pos.direction.toUpperCase()}
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
        <div className="space-y-6">
          {/* Risk Overview */}
          <div className="terminal-border rounded-lg p-4 space-y-4 cursor-pointer" onClick={() => navigate('/risk')}>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              {t.dashboard.riskOverview}
            </h2>
            <ProgressBar value={dailyRiskUsed} max={settings.max_daily_risk} label={t.dashboard.dailyRisk} />
            <ProgressBar value={positions.length} max={settings.max_positions} label="Posiciones" />
            <ProgressBar value={exposurePercent > 100 ? 100 : exposurePercent} max={100} label="Exposición" />
          </div>

          {/* Capital Summary */}
          <div className="terminal-border rounded-lg p-4 space-y-3 cursor-pointer" onClick={() => navigate('/settings')}>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Capital & Riesgo
            </h2>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between"><span className="text-muted-foreground">Capital Inicial</span><span className="text-foreground">{formatCurrency(settings.initial_capital)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Capital Actual</span><span className="text-foreground">{formatCurrency(settings.current_capital)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Riesgo/Trade</span><span className="text-warning">{settings.risk_per_trade}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">$ en Riesgo</span><span className="text-loss">{formatCurrency(settings.current_capital * settings.risk_per_trade / 100)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Drawdown</span><span className="text-foreground">{settings.max_drawdown}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Posiciones</span><span className="text-foreground">{settings.max_positions}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">R/R Mínimo</span><span className="text-foreground">{settings.min_rr_ratio}:1</span></div>
            </div>
          </div>

          {/* Alerts - from real agent analyses */}
          <div className="terminal-border rounded-lg p-4 space-y-3 cursor-pointer" onClick={() => navigate('/agents')}>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {t.dashboard.activeAlerts}
            </h2>
            {warnings.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">Sin alertas activas</p>
            ) : warnings.map((alert) => {
              const severity = getAgentSeverity(alert.agent_type, alert.content);
              return (
                <div key={alert.id} className={cn(
                  "rounded-md p-3 border",
                  severity === 'critical' ? "bg-destructive/5 border-destructive/20" :
                  severity === 'warning' ? "bg-warning/5 border-warning/20" :
                  "bg-accent/50 border-border"
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

          {/* Pending Ideas - from real trade_signals */}
          <div className="terminal-border rounded-lg p-4 space-y-3 cursor-pointer" onClick={() => navigate('/trade-ideas')}>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {t.dashboard.pendingTradeIdeas}
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
                <div className="mt-1 text-xs font-mono text-muted-foreground">
                  {t.common.confidence}: {signal.confidence}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Activity Feed - from real agent_analyses */}
      <div className="terminal-border rounded-lg cursor-pointer" onClick={() => navigate('/agents')}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {t.dashboard.agentActivityFeed}
          </h2>
          <span className="text-xs font-mono text-muted-foreground">{agentOutputs.length} {t.dashboard.recentOutputs}</span>
        </div>
        <div className="divide-y divide-border/50">
          {agentOutputs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs font-mono">
              Sin actividad de agentes. Ve al Panel de Agentes para ejecutar análisis.
            </div>
          ) : agentOutputs.slice(0, 5).map((output) => {
            const severity = getAgentSeverity(output.agent_type, output.content);
            return (
              <div key={output.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      variant={severity === 'critical' ? 'loss' : severity === 'warning' ? 'warning' : 'info'}
                      dot
                    >
                      {AGENT_LABELS[output.agent_type] || output.agent_type}
                    </StatusBadge>
                    <span className="text-sm font-medium text-foreground">{extractTitle(output.content)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap ml-2">
                    {new Date(output.created_at).toLocaleTimeString(dateLocale)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {output.content.replace(/[#*_]/g, '').slice(0, 200)}...
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
