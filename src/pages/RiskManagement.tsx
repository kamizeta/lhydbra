import { useState, useEffect } from "react";
import { Shield, AlertTriangle, Lock, BarChart3, Activity } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import ProgressBar from "@/components/shared/ProgressBar";
import StatusBadge from "@/components/shared/StatusBadge";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface Position {
  symbol: string;
  asset_type: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  direction: string;
}

export default function RiskManagement() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchPositions = async () => {
      const { data } = await supabase
        .from('positions')
        .select('symbol, asset_type, quantity, avg_entry, stop_loss, take_profit, direction')
        .eq('user_id', user.id)
        .eq('status', 'open');
      if (data) setPositions(data);
    };
    fetchPositions();

    const channel = supabase
      .channel('risk-positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => fetchPositions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Calculate real risk metrics from actual positions
  const totalCapital = settings.current_capital;
  const openCount = positions.length;

  // Calculate exposure per asset type
  const exposureByType: Record<string, number> = {};
  let totalExposureValue = 0;
  positions.forEach(p => {
    const value = p.quantity * p.avg_entry;
    totalExposureValue += value;
    exposureByType[p.asset_type] = (exposureByType[p.asset_type] || 0) + value;
  });
  const totalExposurePct = totalCapital > 0 ? (totalExposureValue / totalCapital) * 100 : 0;

  // Calculate risk used (positions with stop loss)
  let totalRiskDollars = 0;
  positions.forEach(p => {
    if (p.stop_loss) {
      const riskPerUnit = Math.abs(p.avg_entry - p.stop_loss);
      totalRiskDollars += riskPerUnit * p.quantity;
    }
  });
  const dailyRiskUsed = totalCapital > 0 ? (totalRiskDollars / totalCapital) * 100 : 0;

  // Max single asset exposure
  const maxSingleExposure = totalCapital > 0
    ? Math.max(0, ...Object.values(exposureByType).map(v => (v / totalCapital) * 100))
    : 0;

  const rm = {
    totalExposure: Math.min(totalExposurePct, 100),
    maxExposureLimit: 100,
    dailyRiskUsed: parseFloat(dailyRiskUsed.toFixed(1)),
    dailyRiskLimit: settings.max_daily_risk,
    weeklyRiskUsed: parseFloat(dailyRiskUsed.toFixed(1)), // Simplified: same as daily for now
    weeklyRiskLimit: settings.max_weekly_risk,
    currentDrawdown: 0, // Would need historical equity curve
    maxDrawdownLimit: settings.max_drawdown,
    openPositions: openCount,
    maxPositions: settings.max_positions,
    correlationRisk: 0,
    leverageUsed: totalCapital > 0 ? parseFloat((totalExposureValue / totalCapital).toFixed(2)) : 0,
    maxLeverage: settings.max_leverage,
  };

  const riskRules = [
    { label: t.riskMgmt.maxRiskPerTrade, value: `${settings.risk_per_trade}%`, status: 'ok' as const },
    { label: t.riskMgmt.maxDailyRisk, value: `${rm.dailyRiskLimit}%`, status: rm.dailyRiskUsed > rm.dailyRiskLimit * 0.8 ? 'warning' as const : 'ok' as const },
    { label: t.riskMgmt.maxWeeklyRisk, value: `${rm.weeklyRiskLimit}%`, status: rm.weeklyRiskUsed > rm.weeklyRiskLimit * 0.8 ? 'warning' as const : 'ok' as const },
    { label: t.riskMgmt.maxDrawdown, value: `${rm.maxDrawdownLimit}%`, status: 'ok' as const },
    { label: t.riskMgmt.maxPositions, value: `${rm.maxPositions}`, status: rm.openPositions >= rm.maxPositions ? 'blocked' as const : 'ok' as const },
    { label: t.riskMgmt.maxLeverage, value: `${rm.maxLeverage}x`, status: rm.leverageUsed > rm.maxLeverage * 0.8 ? 'warning' as const : 'ok' as const },
    { label: t.riskMgmt.maxSingleAsset, value: `${settings.max_single_asset}%`, status: maxSingleExposure > settings.max_single_asset ? 'blocked' as const : 'ok' as const },
    { label: t.riskMgmt.maxCorrelation, value: `${settings.max_correlation}%`, status: 'ok' as const },
    { label: t.riskMgmt.stopLossRequired, value: settings.stop_loss_required ? t.riskMgmt.required : 'No', status: positions.some(p => !p.stop_loss) && settings.stop_loss_required ? 'warning' as const : 'ok' as const },
    { label: t.riskMgmt.minRRRatio, value: `${settings.min_rr_ratio}:1`, status: 'ok' as const },
  ];

  const accountSize = settings.current_capital;
  const riskPercent = settings.risk_per_trade;
  const entryPrice = 120;
  const stopLossPrice = 115;
  const riskPerShare = entryPrice - stopLossPrice;
  const dollarRisk = accountSize * (riskPercent / 100);
  const positionSize = riskPerShare > 0 ? Math.floor(dollarRisk / riskPerShare) : 0;

  const typeLabels: Record<string, string> = {
    crypto: t.common.crypto,
    stock: t.common.stocks,
    etf: t.common.etfs,
    commodity: t.common.commodities,
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.riskMgmt.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.riskMgmt.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t.riskMgmt.dailyRisk} value={`${rm.dailyRiskUsed}%`} change={`${formatNumber(rm.dailyRiskLimit - rm.dailyRiskUsed)}% ${t.riskMgmt.remaining}`} changeType="neutral" icon={Shield} />
        <MetricCard label={t.riskMgmt.drawdown} value={`${rm.currentDrawdown}%`} change={`${t.riskMgmt.limit}: ${rm.maxDrawdownLimit}%`} changeType={rm.currentDrawdown > rm.maxDrawdownLimit * 0.5 ? 'negative' : 'neutral'} icon={AlertTriangle} />
        <MetricCard label={t.riskMgmt.exposure} value={`${formatNumber(rm.totalExposure)}%`} change={`${t.riskMgmt.limit}: ${rm.maxExposureLimit}%`} changeType="neutral" icon={BarChart3} />
        <MetricCard label={t.riskMgmt.correlation} value={`${rm.correlationRisk}%`} change={t.riskMgmt.normal} changeType="neutral" icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Meters */}
        <div className="terminal-border rounded-lg p-4 space-y-5">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> {t.riskMgmt.riskMeters}
          </h2>
          <ProgressBar value={rm.dailyRiskUsed} max={rm.dailyRiskLimit} label={t.riskMgmt.dailyRisk} />
          <ProgressBar value={rm.weeklyRiskUsed} max={rm.weeklyRiskLimit} label={t.riskMgmt.weeklyRisk} />
          <ProgressBar value={rm.currentDrawdown} max={rm.maxDrawdownLimit} label={t.riskMgmt.drawdown} />
          <ProgressBar value={rm.totalExposure} max={rm.maxExposureLimit} label={t.riskMgmt.totalExposure} />
          <ProgressBar value={rm.leverageUsed} max={rm.maxLeverage} label={t.riskMgmt.leverage} variant="default" />
        </div>

        {/* Rules */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-primary" /> {t.riskMgmt.riskRules}
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
            <BarChart3 className="h-4 w-4 text-primary" /> {t.riskMgmt.positionSizing}
          </h2>
          <div className="space-y-3">
            <div className="rounded-md bg-accent/50 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.riskMgmt.accountSize}</span>
                <span className="font-mono text-foreground">{formatCurrency(accountSize)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.riskMgmt.riskPercent}</span>
                <span className="font-mono text-foreground">{riskPercent}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.riskMgmt.dollarAtRisk}</span>
                <span className="font-mono text-loss">{formatCurrency(dollarRisk)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.common.entry}</span>
                <span className="font-mono text-foreground">{formatCurrency(entryPrice)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.common.stopLoss}</span>
                <span className="font-mono text-loss">{formatCurrency(stopLossPrice)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.riskMgmt.riskPerShare}</span>
                <span className="font-mono text-foreground">{formatCurrency(riskPerShare)}</span>
              </div>
            </div>
            <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-foreground">{t.riskMgmt.positionSize}</span>
                <span className="text-xl font-bold font-mono text-primary">{positionSize} {t.riskMgmt.shares}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t.riskMgmt.totalValue}: {formatCurrency(positionSize * entryPrice)}
              </p>
            </div>
          </div>

          {/* Exposure by type - from real positions */}
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mt-6 mb-3">{t.riskMgmt.exposureByMarket}</h3>
          {(['crypto', 'stock', 'etf', 'commodity'] as const).map(type => {
            const alloc = totalCapital > 0 ? ((exposureByType[type] || 0) / totalCapital) * 100 : 0;
            return (
              <div key={type} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">{typeLabels[type]}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", alloc > settings.max_single_asset ? "bg-warning" : "bg-primary")}
                      style={{ width: `${Math.min(alloc, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-foreground w-12 text-right">{formatNumber(alloc)}%</span>
                </div>
              </div>
            );
          })}

          {openCount === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-4 italic">No hay posiciones abiertas</p>
          )}
        </div>
      </div>
    </div>
  );
}
