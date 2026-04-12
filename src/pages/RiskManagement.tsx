import { useState, useEffect } from "react";
import { Shield, AlertTriangle, Lock, BarChart3, Activity } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import ProgressBar from "@/components/shared/ProgressBar";
import StatusBadge from "@/components/shared/StatusBadge";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber } from "@/lib/utils";
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
  const [weeklyLossPnl, setWeeklyLossPnl] = useState(0);
  const [correlationMax, setCorrelationMax] = useState(0);

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

    const fetchWeeklyRisk = async () => {
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
      const { data } = await supabase
        .from('trade_journal')
        .select('pnl')
        .eq('user_id', user.id)
        .gte('exited_at', weekStart.toISOString());
      const losses = (data || []).filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + Math.abs(t.pnl || 0), 0);
      setWeeklyLossPnl(losses);
    };

    const fetchCorrelation = async () => {
      const { data } = await supabase
        .from('correlation_matrix')
        .select('correlation')
        .order('correlation', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setCorrelationMax(Math.abs(Number(data[0].correlation)) * 100);
      }
    };

    fetchPositions();
    fetchWeeklyRisk();
    fetchCorrelation();

    const channel = supabase
      .channel('risk-positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => fetchPositions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const totalCapital = settings.current_capital;
  const openCount = positions.length;

  const exposureByType: Record<string, number> = {};
  let totalExposureValue = 0;
  positions.forEach(p => {
    const value = Math.abs(p.quantity) * p.avg_entry;
    totalExposureValue += value;
    exposureByType[p.asset_type] = (exposureByType[p.asset_type] || 0) + value;
  });
  const totalExposurePct = totalCapital > 0 ? (totalExposureValue / totalCapital) * 100 : 0;

  let totalRiskDollars = 0;
  positions.forEach(p => {
    if (p.stop_loss) {
      const riskPerUnit = Math.abs(p.avg_entry - p.stop_loss);
      totalRiskDollars += riskPerUnit * Math.abs(p.quantity);
    }
  });
  const dailyRiskUsed = totalCapital > 0 ? (totalRiskDollars / totalCapital) * 100 : 0;

  const maxSingleExposure = totalCapital > 0
    ? Math.max(0, ...Object.values(exposureByType).map(v => (v / totalCapital) * 100))
    : 0;

  const initialCapital = settings.initial_capital;
  const currentDrawdown = initialCapital > 0 ? Math.max(0, ((initialCapital - totalCapital) / initialCapital) * 100) : 0;
  const weeklyRiskUsedPct = totalCapital > 0 ? (weeklyLossPnl / totalCapital) * 100 : 0;

  const rm = {
    totalExposure: Math.min(totalExposurePct, 100),
    maxExposureLimit: 100,
    dailyRiskUsed: parseFloat(dailyRiskUsed.toFixed(1)),
    dailyRiskLimit: settings.max_daily_risk,
    weeklyRiskUsed: parseFloat(weeklyRiskUsedPct.toFixed(1)),
    weeklyRiskLimit: settings.max_weekly_risk,
    currentDrawdown: parseFloat(currentDrawdown.toFixed(1)),
    maxDrawdownLimit: settings.max_drawdown,
    openPositions: openCount,
    maxPositions: settings.max_positions,
    correlationRisk: parseFloat(correlationMax.toFixed(1)),
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

  // Consolidated risk per position
  const accountSize = settings.current_capital;
  const riskPercent = settings.risk_per_trade;
  const dollarRiskPerTrade = accountSize * (riskPercent / 100);

  const positionRiskDetails = positions.map(p => {
    const entry = Number(p.avg_entry);
    const sl = p.stop_loss ? Number(p.stop_loss) : 0;
    const tp = p.take_profit ? Number(p.take_profit) : 0;
    const riskPerUnit = entry > 0 && sl > 0 ? Math.abs(entry - sl) : 0;
    const qty = Math.abs(p.quantity);
    const riskDollars = riskPerUnit * qty;
    const riskPct = accountSize > 0 ? (riskDollars / accountSize) * 100 : 0;
    const exposureValue = qty * entry;
    const exposurePct = accountSize > 0 ? (exposureValue / accountSize) * 100 : 0;
    const rewardPerUnit = tp > 0 ? Math.abs(tp - entry) : 0;
    const rr = riskPerUnit > 0 && rewardPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
    const isFractional = p.asset_type === 'crypto' || p.asset_type === 'forex';
    const idealSize = riskPerUnit > 0 ? dollarRiskPerTrade / riskPerUnit : 0;
    const idealSizeDisplay = isFractional ? parseFloat(idealSize.toFixed(6)) : Math.floor(idealSize);
    const isSLMissing = !p.stop_loss;
    const isOversized = qty > idealSize * 1.1; // >10% over ideal

    return {
      ...p,
      entry, sl, tp, riskPerUnit, riskDollars, riskPct,
      exposureValue, exposurePct, rr, isFractional,
      idealSize: idealSizeDisplay, isSLMissing, isOversized,
    };
  });

  const totalRiskAll = positionRiskDetails.reduce((s, p) => s + p.riskDollars, 0);
  const totalRiskPctAll = accountSize > 0 ? (totalRiskAll / accountSize) * 100 : 0;
  const capitalInvested = positionRiskDetails.reduce((s, p) => s + p.exposureValue, 0);
  const capitalAvailable = accountSize;
  const positionsWithoutSL = positionRiskDetails.filter(p => p.isSLMissing).length;
  const oversizedPositions = positionRiskDetails.filter(p => p.isOversized).length;

  const typeLabels: Record<string, string> = {
    crypto: t.common.crypto,
    stock: t.common.stocks,
    etf: t.common.etfs,
    forex: t.common.forex,
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

        {/* Account Risk Overview */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" /> Resumen de Cuenta
          </h2>
          <div className="space-y-3">
            {/* Account summary */}
            <div className="rounded-md bg-accent/50 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.riskMgmt.accountSize}</span>
                <span className="font-mono text-foreground font-medium">{formatCurrency(accountSize)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Capital Invertido</span>
                <span className="font-mono text-foreground">{formatCurrency(capitalInvested)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Riesgo Total Abierto</span>
                <span className={cn("font-mono font-medium", totalRiskPctAll > settings.max_daily_risk ? "text-loss" : "text-warning")}>
                  {formatCurrency(totalRiskAll)} ({formatNumber(totalRiskPctAll)}%)
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Posiciones Abiertas</span>
                <span className="font-mono text-foreground">{openCount} / {settings.max_positions}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Riesgo por Trade (regla)</span>
                <span className="font-mono text-foreground">{riskPercent}% = {formatCurrency(dollarRiskPerTrade)}</span>
              </div>
            </div>

            {/* Alerts */}
            {(positionsWithoutSL > 0 || oversizedPositions > 0) && (
              <div className="rounded-md bg-loss/10 border border-loss/20 p-2 space-y-1">
                {positionsWithoutSL > 0 && (
                  <p className="text-[10px] text-loss flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {positionsWithoutSL} posición(es) sin Stop Loss
                  </p>
                )}
                {oversizedPositions > 0 && (
                  <p className="text-[10px] text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {oversizedPositions} posición(es) sobredimensionada(s)
                  </p>
                )}
              </div>
            )}

            {/* Exposure by type */}
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mt-3 mb-2">{t.riskMgmt.exposureByMarket}</h3>
            {(['crypto', 'stock', 'etf', 'forex', 'commodity'] as const).map(type => {
              const alloc = totalCapital > 0 ? ((exposureByType[type] || 0) / totalCapital) * 100 : 0;
              if (alloc === 0) return null;
              return (
                <div key={type} className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">{typeLabels[type] || type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", alloc > settings.max_single_asset ? "bg-warning" : "bg-primary")}
                        style={{ width: `${Math.min(alloc, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-foreground w-14 text-right">{formatNumber(alloc)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-Position Risk Breakdown */}
      {positions.length > 0 && (
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-primary" /> Riesgo por Posición
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Activo</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Cantidad</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Entrada</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Stop Loss</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Riesgo $</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Riesgo %</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">R:R</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Tamaño Ideal</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {positionRiskDetails.map((p, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                    <td className="py-2">
                      <div>
                        <span className="font-medium text-foreground">{p.symbol}</span>
                        <span className={cn("ml-1.5 text-[10px]", p.direction === 'long' ? 'text-profit' : 'text-loss')}>
                          {p.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-2 font-mono text-foreground">{p.isFractional ? Math.abs(p.quantity) : Math.floor(Math.abs(p.quantity))}</td>
                    <td className="text-right py-2 font-mono text-foreground">{formatCurrency(p.entry)}</td>
                    <td className="text-right py-2 font-mono">
                      {p.isSLMissing ? (
                        <span className="text-loss">⚠ Sin SL</span>
                      ) : (
                        <span className="text-loss">{formatCurrency(p.sl)}</span>
                      )}
                    </td>
                    <td className="text-right py-2 font-mono text-loss">{formatCurrency(p.riskDollars)}</td>
                    <td className={cn("text-right py-2 font-mono", p.riskPct > riskPercent ? "text-loss font-bold" : "text-foreground")}>
                      {formatNumber(p.riskPct)}%
                    </td>
                    <td className={cn("text-right py-2 font-mono", p.rr >= settings.min_rr_ratio ? "text-profit" : p.rr > 0 ? "text-warning" : "text-muted-foreground")}>
                      {p.rr > 0 ? `${p.rr.toFixed(1)}:1` : '—'}
                    </td>
                    <td className="text-right py-2 font-mono text-primary">
                      {p.isSLMissing ? '—' : p.idealSize}
                    </td>
                    <td className="text-center py-2">
                      {p.isSLMissing ? (
                        <StatusBadge variant="loss" dot>SIN SL</StatusBadge>
                      ) : p.isOversized ? (
                        <StatusBadge variant="warning" dot>EXCESO</StatusBadge>
                      ) : p.riskPct > riskPercent ? (
                        <StatusBadge variant="warning" dot>ALTO</StatusBadge>
                      ) : (
                        <StatusBadge variant="profit" dot>OK</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2 font-medium text-foreground" colSpan={4}>TOTAL</td>
                  <td className="text-right py-2 font-mono text-loss font-medium">{formatCurrency(totalRiskAll)}</td>
                  <td className={cn("text-right py-2 font-mono font-medium", totalRiskPctAll > settings.max_daily_risk ? "text-loss" : "text-foreground")}>
                    {formatNumber(totalRiskPctAll)}%
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {positions.length > 0 && (
             <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              💡 <strong>{language === 'es' ? 'Tamaño Ideal' : 'Ideal Size'}</strong> = {t.riskMgmt.idealSizeNote.replace('{riskPct}', String(riskPercent)).replace('{dollarRisk}', formatCurrency(dollarRiskPerTrade))}
              {language === 'es' 
                ? <> Si tu cantidad actual es mayor al ideal, la posición está <span className="text-warning">sobredimensionada</span>.</>
                : <> If your current size exceeds the ideal, the position is <span className="text-warning">oversized</span>.</>
              }
            </p>
          )}
        </div>
      )}

      {openCount === 0 && (
        <div className="terminal-border rounded-lg p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t.allocationPage.noOpenPositionsDesc}</p>
        </div>
      )}
    </div>
  );
}
