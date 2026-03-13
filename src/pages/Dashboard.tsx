import { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  PieChart,
  AlertTriangle,
  Zap,
  BarChart3,
  Bot,
} from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import ProgressBar from "@/components/shared/ProgressBar";
import OnboardingTutorial from "@/components/OnboardingTutorial";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  mockAgentOutputs,
  mockTradeIdeas,
  formatCurrency,
  formatNumber,
} from "@/lib/mockData";
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

export default function Dashboard() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useUserSettings();
  const [positions, setPositions] = useState<DBPosition[]>([]);

  useEffect(() => {
    if (user) {
      supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .then(({ data }) => setPositions((data as DBPosition[]) || []));
    }
  }, [user]);
  const pendingIdeas = mockTradeIdeas.filter(t => t.status === 'pending');
  const warnings = mockAgentOutputs.filter(a => a.severity === 'warning' || a.severity === 'critical');

  const dateLocale = language === 'es' ? 'es-ES' : language === 'pt' ? 'pt-BR' : language === 'fr' ? 'fr-FR' : 'en-US';

  // Compute portfolio value from current capital
  const portfolioValue = settings.current_capital;
  const dailyPnl = portfolioValue * 0.0157; // placeholder until real PnL tracking
  const dailyPnlPercent = 1.57;

  // Risk metrics from real settings
  const riskMetrics = {
    dailyRiskUsed: 2.8, // TODO: calculate from real positions
    dailyRiskLimit: settings.max_daily_risk,
    weeklyRiskUsed: 6.2,
    weeklyRiskLimit: settings.max_weekly_risk,
    currentDrawdown: 3.4,
    maxDrawdownLimit: settings.max_drawdown,
    openPositions: positions.length,
    maxPositions: settings.max_positions,
  };

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
            <StatusBadge variant="warning" dot>{warnings.length} {t.dashboard.activeAlerts}</StatusBadge>
          )}
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label={t.dashboard.portfolioValue}
          value={formatCurrency(portfolioValue)}
          change={`Capital inicial: ${formatCurrency(settings.initial_capital)}`}
          changeType="neutral"
          icon={DollarSign}
        />
        <MetricCard
          label={t.dashboard.dailyPnl}
          value={`+${formatCurrency(dailyPnl)}`}
          change={`+${dailyPnlPercent}% ${t.dashboard.today}`}
          changeType="positive"
          icon={TrendingUp}
        />
        <MetricCard
          label={t.dashboard.riskUsed}
          value={`${riskMetrics.dailyRiskUsed}%`}
          change={`${riskMetrics.dailyRiskLimit}% ${t.dashboard.ofDailyLimit}`}
          changeType="neutral"
          icon={Shield}
          subtitle={`${t.dashboard.drawdown}: ${riskMetrics.currentDrawdown}%`}
        />
        <MetricCard
          label={t.dashboard.activePositions}
          value={`${riskMetrics.openPositions}`}
          change={`${pendingIdeas.length} ${t.dashboard.pendingIdeas}`}
          changeType="neutral"
          icon={Activity}
          subtitle={`${t.dashboard.max}: ${riskMetrics.maxPositions}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Positions */}
        <div className="lg:col-span-2 terminal-border rounded-lg">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              {t.dashboard.openPositions}
            </h2>
            <span className="text-xs font-mono text-muted-foreground">{mockPortfolio.length} {t.common.active}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">{t.common.asset}</th>
                  <th className="text-right p-3">{t.common.price}</th>
                  <th className="text-right p-3">{t.dashboard.pnl}</th>
                  <th className="text-right p-3">{t.dashboard.alloc}</th>
                  <th className="text-right p-3">{t.common.strategy}</th>
                </tr>
              </thead>
              <tbody>
                {mockPortfolio.map((pos) => (
                  <tr key={pos.symbol} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-3">
                      <div className="font-mono font-medium text-foreground">{pos.symbol}</div>
                      <div className="text-xs text-muted-foreground">{pos.name}</div>
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">{formatCurrency(pos.currentPrice)}</td>
                    <td className="text-right p-3">
                      <div className={cn("font-mono font-medium", pos.pnl >= 0 ? "text-profit" : "text-loss")}>
                        {pos.pnl >= 0 ? '+' : ''}{formatCurrency(pos.pnl)}
                      </div>
                      <div className={cn("text-xs font-mono", pos.pnlPercent >= 0 ? "text-profit" : "text-loss")}>
                        {pos.pnlPercent >= 0 ? '+' : ''}{formatNumber(pos.pnlPercent)}%
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-muted-foreground">{formatNumber(pos.allocation)}%</td>
                    <td className="text-right p-3">
                      <StatusBadge variant="info">{pos.strategy}</StatusBadge>
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
          <div className="terminal-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              {t.dashboard.riskOverview}
            </h2>
            <ProgressBar value={riskMetrics.dailyRiskUsed} max={riskMetrics.dailyRiskLimit} label={t.dashboard.dailyRisk} />
            <ProgressBar value={riskMetrics.weeklyRiskUsed} max={riskMetrics.weeklyRiskLimit} label={t.dashboard.weeklyRisk} />
            <ProgressBar value={riskMetrics.currentDrawdown} max={riskMetrics.maxDrawdownLimit} label={t.dashboard.drawdown} />
          </div>

          {/* Capital Summary */}
          <div className="terminal-border rounded-lg p-4 space-y-3">
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

          {/* Alerts */}
          <div className="terminal-border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {t.dashboard.activeAlerts}
            </h2>
            {warnings.map((alert) => (
              <div key={alert.id} className="rounded-md bg-warning/5 border border-warning/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{alert.content}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">{alert.agent}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pending Ideas */}
          <div className="terminal-border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {t.dashboard.pendingTradeIdeas}
            </h2>
            {pendingIdeas.map((idea) => (
              <div key={idea.id} className="rounded-md bg-accent/50 border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono font-medium text-sm text-foreground">{idea.symbol}</div>
                  <StatusBadge variant={idea.direction === 'long' ? 'profit' : 'loss'}>
                    {idea.direction.toUpperCase()}
                  </StatusBadge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{idea.strategy} • R/R {formatNumber(idea.riskReward)}</div>
                <div className="mt-1 text-xs font-mono text-muted-foreground">
                  {t.common.confidence}: {idea.confidence}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Activity Feed */}
      <div className="terminal-border rounded-lg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {t.dashboard.agentActivityFeed}
          </h2>
          <span className="text-xs font-mono text-muted-foreground">{mockAgentOutputs.length} {t.dashboard.recentOutputs}</span>
        </div>
        <div className="divide-y divide-border/50">
          {mockAgentOutputs.slice(0, 5).map((output) => (
            <div key={output.id} className="p-4 hover:bg-accent/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    variant={output.severity === 'critical' ? 'loss' : output.severity === 'warning' ? 'warning' : 'info'}
                    dot
                  >
                    {output.agent}
                  </StatusBadge>
                  <span className="text-sm font-medium text-foreground">{output.title}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {new Date(output.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{output.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
