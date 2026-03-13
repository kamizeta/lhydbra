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
import {
  mockPortfolio,
  mockAgentOutputs,
  mockTradeIdeas,
  mockRiskMetrics,
  portfolioValue,
  portfolioChange,
  portfolioChangePercent,
  formatCurrency,
  formatNumber,
} from "@/lib/mockData";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const pendingIdeas = mockTradeIdeas.filter(t => t.status === 'pending');
  const warnings = mockAgentOutputs.filter(a => a.severity === 'warning' || a.severity === 'critical');

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-mono">Portfolio Overview • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant="profit" dot>Market Open</StatusBadge>
          {warnings.length > 0 && (
            <StatusBadge variant="warning" dot>{warnings.length} Alerts</StatusBadge>
          )}
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Portfolio Value"
          value={formatCurrency(portfolioValue)}
          change={`+${formatCurrency(portfolioChange)} (+${formatNumber(portfolioChangePercent)}%)`}
          changeType="positive"
          icon={DollarSign}
        />
        <MetricCard
          label="Daily P&L"
          value={`+${formatCurrency(1842.30)}`}
          change="+1.57% today"
          changeType="positive"
          icon={TrendingUp}
        />
        <MetricCard
          label="Risk Used"
          value={`${mockRiskMetrics.dailyRiskUsed}%`}
          change={`of ${mockRiskMetrics.dailyRiskLimit}% daily limit`}
          changeType="neutral"
          icon={Shield}
          subtitle={`Drawdown: ${mockRiskMetrics.currentDrawdown}%`}
        />
        <MetricCard
          label="Active Positions"
          value={`${mockRiskMetrics.openPositions}`}
          change={`${pendingIdeas.length} pending ideas`}
          changeType="neutral"
          icon={Activity}
          subtitle={`Max: ${mockRiskMetrics.maxPositions}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Positions */}
        <div className="lg:col-span-2 terminal-border rounded-lg">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              Open Positions
            </h2>
            <span className="text-xs font-mono text-muted-foreground">{mockPortfolio.length} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">Asset</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-right p-3">Alloc</th>
                  <th className="text-right p-3">Strategy</th>
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
              Risk Overview
            </h2>
            <ProgressBar value={mockRiskMetrics.dailyRiskUsed} max={mockRiskMetrics.dailyRiskLimit} label="Daily Risk" />
            <ProgressBar value={mockRiskMetrics.weeklyRiskUsed} max={mockRiskMetrics.weeklyRiskLimit} label="Weekly Risk" />
            <ProgressBar value={mockRiskMetrics.currentDrawdown} max={mockRiskMetrics.maxDrawdownLimit} label="Drawdown" />
            <ProgressBar value={mockRiskMetrics.totalExposure} max={mockRiskMetrics.maxExposureLimit} label="Exposure" />
          </div>

          {/* Alerts */}
          <div className="terminal-border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Active Alerts
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
              Pending Trade Ideas
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
                  Confidence: {idea.confidence}%
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
            Agent Activity Feed
          </h2>
          <span className="text-xs font-mono text-muted-foreground">{mockAgentOutputs.length} recent outputs</span>
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
