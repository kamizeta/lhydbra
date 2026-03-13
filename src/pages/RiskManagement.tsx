import { Shield, AlertTriangle, Lock, Unlock, BarChart3, Activity } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import ProgressBar from "@/components/shared/ProgressBar";
import StatusBadge from "@/components/shared/StatusBadge";
import { mockRiskMetrics, mockPortfolio, formatCurrency, formatNumber } from "@/lib/mockData";
import { cn } from "@/lib/utils";

export default function RiskManagement() {
  const rm = mockRiskMetrics;

  const riskRules = [
    { label: 'Max Risk Per Trade', value: '2%', status: 'ok' as const },
    { label: 'Max Daily Risk', value: `${rm.dailyRiskLimit}%`, status: rm.dailyRiskUsed > rm.dailyRiskLimit * 0.8 ? 'warning' as const : 'ok' as const },
    { label: 'Max Weekly Risk', value: `${rm.weeklyRiskLimit}%`, status: rm.weeklyRiskUsed > rm.weeklyRiskLimit * 0.8 ? 'warning' as const : 'ok' as const },
    { label: 'Max Drawdown', value: `${rm.maxDrawdownLimit}%`, status: 'ok' as const },
    { label: 'Max Positions', value: `${rm.maxPositions}`, status: rm.openPositions >= rm.maxPositions ? 'blocked' as const : 'ok' as const },
    { label: 'Max Leverage', value: `${rm.maxLeverage}x`, status: 'ok' as const },
    { label: 'Max Single Asset', value: '30%', status: 'ok' as const },
    { label: 'Max Correlation', value: '70%', status: rm.correlationRisk > 60 ? 'warning' as const : 'ok' as const },
    { label: 'Stop Loss', value: 'Required', status: 'ok' as const },
    { label: 'Min R/R Ratio', value: '1.5:1', status: 'ok' as const },
  ];

  // Position sizing calculator
  const accountSize = 119250;
  const riskPercent = 1.5;
  const entryPrice = 875;
  const stopLossPrice = 830;
  const riskPerShare = entryPrice - stopLossPrice;
  const dollarRisk = accountSize * (riskPercent / 100);
  const positionSize = Math.floor(dollarRisk / riskPerShare);

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Management</h1>
        <p className="text-sm text-muted-foreground font-mono">Capital protection • Position sizing • Exposure control</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Daily Risk" value={`${rm.dailyRiskUsed}%`} change={`${formatNumber(rm.dailyRiskLimit - rm.dailyRiskUsed)}% remaining`} changeType="neutral" icon={Shield} />
        <MetricCard label="Drawdown" value={`${rm.currentDrawdown}%`} change={`Limit: ${rm.maxDrawdownLimit}%`} changeType={rm.currentDrawdown > rm.maxDrawdownLimit * 0.5 ? 'negative' : 'neutral'} icon={AlertTriangle} />
        <MetricCard label="Exposure" value={`${rm.totalExposure}%`} change={`Limit: ${rm.maxExposureLimit}%`} changeType="neutral" icon={BarChart3} />
        <MetricCard label="Correlation" value={`${rm.correlationRisk}%`} change={rm.correlationRisk > 60 ? 'Elevated' : 'Normal'} changeType={rm.correlationRisk > 60 ? 'negative' : 'neutral'} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Meters */}
        <div className="terminal-border rounded-lg p-4 space-y-5">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Risk Meters
          </h2>
          <ProgressBar value={rm.dailyRiskUsed} max={rm.dailyRiskLimit} label="Daily Risk" />
          <ProgressBar value={rm.weeklyRiskUsed} max={rm.weeklyRiskLimit} label="Weekly Risk" />
          <ProgressBar value={rm.currentDrawdown} max={rm.maxDrawdownLimit} label="Drawdown" />
          <ProgressBar value={rm.totalExposure} max={rm.maxExposureLimit} label="Total Exposure" />
          <ProgressBar value={rm.leverageUsed} max={rm.maxLeverage} label="Leverage" variant="default" />
          <ProgressBar value={rm.correlationRisk} max={100} label="Correlation Risk" />
        </div>

        {/* Rules */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-primary" /> Risk Rules
          </h2>
          <div className="space-y-2">
            {riskRules.map((rule, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground">{rule.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">{rule.value}</span>
                  <StatusBadge
                    variant={rule.status === 'ok' ? 'profit' : rule.status === 'warning' ? 'warning' : 'loss'}
                    dot
                  >
                    {rule.status === 'ok' ? 'OK' : rule.status === 'warning' ? 'WARN' : 'BLOCK'}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Position Sizing Calculator */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" /> Position Sizing
          </h2>
          <div className="space-y-3">
            <div className="rounded-md bg-accent/50 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Account Size</span>
                <span className="font-mono text-foreground">{formatCurrency(accountSize)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Risk %</span>
                <span className="font-mono text-foreground">{riskPercent}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">$ at Risk</span>
                <span className="font-mono text-loss">{formatCurrency(dollarRisk)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Entry</span>
                <span className="font-mono text-foreground">{formatCurrency(entryPrice)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stop Loss</span>
                <span className="font-mono text-loss">{formatCurrency(stopLossPrice)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Risk/Share</span>
                <span className="font-mono text-foreground">{formatCurrency(riskPerShare)}</span>
              </div>
            </div>
            <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-foreground">Position Size</span>
                <span className="text-xl font-bold font-mono text-primary">{positionSize} shares</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Total value: {formatCurrency(positionSize * entryPrice)}
              </p>
            </div>
          </div>

          {/* Exposure by type */}
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mt-6 mb-3">Exposure by Market</h3>
          {(['crypto', 'stock', 'etf', 'commodity'] as const).map(type => {
            const positions = mockPortfolio.filter(p => p.type === type);
            const alloc = positions.reduce((s, p) => s + p.allocation, 0);
            return (
              <div key={type} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground capitalize">{type === 'etf' ? 'ETFs' : type}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", alloc > 35 ? "bg-warning" : "bg-primary")}
                      style={{ width: `${alloc}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-foreground w-12 text-right">{formatNumber(alloc)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
