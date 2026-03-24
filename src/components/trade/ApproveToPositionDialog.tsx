import { useState, useEffect } from "react";
import { Check, X, ArrowRight, Shield, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";

interface TradeSignal {
  id: string;
  asset: string;
  asset_class: string;
  asset_type: string;
  direction: string;
  strategy: string | null;
  strategy_family?: string | null;
  entry_price: number;
  stop_loss: number;
  targets: number[];
  expected_r_multiple: number;
  take_profit?: number;
  opportunity_score?: number | null;
  market_regime?: string | null;
}

interface RiskViolation {
  rule: string;
  current: string;
  limit: string;
  severity: 'block' | 'warning';
}

interface Props {
  signal: TradeSignal;
  onClose: () => void;
  onConfirm: (signalId: string) => void;
}

export default function ApproveToPositionDialog({ signal, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [entryPrice, setEntryPrice] = useState(signal.entry_price);
  const [quantity, setQuantity] = useState(0);
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openPosition, setOpenPosition] = useState(true);
  const [executeOnAlpaca, setExecuteOnAlpaca] = useState(false);
  const [alpacaPaper, setAlpacaPaper] = useState(true);
  const [violations, setViolations] = useState<RiskViolation[]>([]);
  const [openPositionsCount, setOpenPositionsCount] = useState(0);
  const [existingExposure, setExistingExposure] = useState(0);
  const [existingRiskDollars, setExistingRiskDollars] = useState(0);
  const [existingSymbolExposure, setExistingSymbolExposure] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Derive take_profit and risk_reward from signals table schema
  const derivedTakeProfit = signal.take_profit ?? (signal.targets?.[0] ?? signal.entry_price * 1.05);
  const derivedRiskReward = signal.expected_r_multiple;

  // Calculate ideal position size (capped by risk, concentration & leverage limits)
  const riskPerUnit = Math.abs(entryPrice - signal.stop_loss);
  const dollarRisk = settings.current_capital * (settings.risk_per_trade / 100);
  const isFractional = signal.asset_type === 'crypto' || signal.asset_type === 'forex';
  const riskBasedSize = riskPerUnit > 0 ? dollarRisk / riskPerUnit : 0;

  // Cap by max single asset concentration
  const maxAssetValue = Math.max(0, (settings.current_capital * settings.max_single_asset / 100) - existingSymbolExposure);
  const concentrationCap = entryPrice > 0 ? maxAssetValue / entryPrice : Infinity;

  // Cap by max leverage (total exposure)
  const maxTotalExposure = settings.current_capital * settings.max_leverage;
  const availableExposure = Math.max(0, maxTotalExposure - existingExposure);
  const leverageCap = entryPrice > 0 ? availableExposure / entryPrice : Infinity;

  const idealSize = Math.max(0, Math.min(riskBasedSize, concentrationCap, leverageCap));
  const idealSizeDisplay = isFractional ? parseFloat(idealSize.toFixed(6)) : Math.floor(idealSize);

  // Keep the default quantity aligned with the safe ideal size until the user edits it manually
  useEffect(() => {
    if (!loaded || quantityTouched) return;
    setQuantity(idealSizeDisplay > 0 ? idealSizeDisplay : 0);
  }, [loaded, idealSizeDisplay, quantityTouched]);

  // Fetch current portfolio state for risk validation
  useEffect(() => {
    if (!user) return;
    const fetchPortfolio = async () => {
      const { data: positions } = await supabase
        .from('positions')
        .select('symbol, asset_type, quantity, avg_entry, stop_loss, direction')
        .eq('user_id', user.id)
        .eq('status', 'open');

      if (positions) {
        setOpenPositionsCount(positions.length);
        let totalExposure = 0;
        let totalRisk = 0;
        let symbolExposure = 0;

        positions.forEach(p => {
          const value = Number(p.quantity) * Number(p.avg_entry);
          totalExposure += value;
          if (p.stop_loss) {
            totalRisk += Math.abs(Number(p.avg_entry) - Number(p.stop_loss)) * Number(p.quantity);
          }
          if (p.symbol === signal.asset) {
            symbolExposure += value;
          }
        });

        setExistingExposure(totalExposure);
        setExistingRiskDollars(totalRisk);
        setExistingSymbolExposure(symbolExposure);
      }
      setLoaded(true);
    };
    fetchPortfolio();
  }, [user, signal.asset]);

  // Run risk validation whenever inputs change
  useEffect(() => {
    if (!loaded) return;
    const v: RiskViolation[] = [];
    const capital = settings.current_capital;

    // 1. Max positions check
    if (openPositionsCount >= settings.max_positions) {
      v.push({
        rule: 'Máximo de posiciones',
        current: `${openPositionsCount} abiertas`,
        limit: `${settings.max_positions} máximo`,
        severity: 'block',
      });
    }

    // 2. Stop loss required
    if (settings.stop_loss_required && signal.stop_loss <= 0) {
      v.push({
        rule: 'Stop Loss requerido',
        current: 'Sin Stop Loss',
        limit: 'Obligatorio',
        severity: 'block',
      });
    }

    // 3. Minimum R:R ratio
    if (derivedRiskReward < settings.min_rr_ratio) {
      v.push({
        rule: 'Ratio R:R mínimo',
        current: `${formatNumber(derivedRiskReward)}:1`,
        limit: `${settings.min_rr_ratio}:1`,
        severity: 'block',
      });
    }

    // 4. Daily risk check (existing + new)
    const newRiskDollars = riskPerUnit * quantity;
    const totalRiskAfter = existingRiskDollars + newRiskDollars;
    const totalRiskPct = capital > 0 ? (totalRiskAfter / capital) * 100 : 0;
    if (totalRiskPct > settings.max_daily_risk) {
      v.push({
        rule: 'Riesgo diario máximo',
        current: `${formatNumber(totalRiskPct)}%`,
        limit: `${settings.max_daily_risk}%`,
        severity: 'block',
      });
    } else if (totalRiskPct > settings.max_daily_risk * 0.8) {
      v.push({
        rule: 'Riesgo diario',
        current: `${formatNumber(totalRiskPct)}%`,
        limit: `${settings.max_daily_risk}%`,
        severity: 'warning',
      });
    }

    // 5. Single asset concentration
    const newExposure = quantity * entryPrice;
    const symbolExposureAfter = existingSymbolExposure + newExposure;
    const symbolPct = capital > 0 ? (symbolExposureAfter / capital) * 100 : 0;
    if (symbolPct > settings.max_single_asset) {
      v.push({
        rule: 'Concentración en activo',
        current: `${formatNumber(symbolPct)}% en ${signal.asset}`,
        limit: `${settings.max_single_asset}%`,
        severity: 'warning',
      });
    }

    // 6. Position oversized check
    const posRiskPct = capital > 0 ? (newRiskDollars / capital) * 100 : 0;
    if (posRiskPct > settings.risk_per_trade * 1.5) {
      v.push({
        rule: 'Riesgo por trade excesivo',
        current: `${formatNumber(posRiskPct)}% (${formatCurrency(newRiskDollars)})`,
        limit: `${settings.risk_per_trade}% (${formatCurrency(dollarRisk)})`,
        severity: 'block',
      });
    } else if (posRiskPct > settings.risk_per_trade) {
      v.push({
        rule: 'Riesgo por trade elevado',
        current: `${formatNumber(posRiskPct)}%`,
        limit: `${settings.risk_per_trade}%`,
        severity: 'warning',
      });
    }

    // 7. Leverage check
    const totalExposureAfter = existingExposure + newExposure;
    const leverageAfter = capital > 0 ? totalExposureAfter / capital : 0;
    if (leverageAfter > settings.max_leverage) {
      v.push({
        rule: 'Apalancamiento máximo',
        current: `${formatNumber(leverageAfter)}x`,
        limit: `${settings.max_leverage}x`,
        severity: 'block',
      });
    }

    setViolations(v);
  }, [loaded, quantity, entryPrice, openPositionsCount, existingExposure, existingRiskDollars, existingSymbolExposure, settings, signal, riskPerUnit, dollarRisk]);

  const hasBlockers = violations.some(v => v.severity === 'block');

  const handleConfirm = async () => {
    if (!user) return;
    if (hasBlockers && openPosition) {
      toast.error('Hay reglas de riesgo que bloquean esta operación');
      return;
    }
    if (openPosition && (!quantity || quantity <= 0)) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    setSaving(true);

    if (openPosition) {
      // Execute on Alpaca first if enabled
      if (executeOnAlpaca) {
        try {
          const alpacaSide = signal.direction === 'long' ? 'buy' : 'sell';
          const isStock = signal.asset_type === 'stock' || signal.asset_type === 'etf';
          
          const orderBody: Record<string, unknown> = {
            action: 'place_order',
            paper: alpacaPaper,
            symbol: signal.asset.replace('/', ''),
            qty: quantity,
            side: alpacaSide,
            type: 'market',
            time_in_force: isStock ? 'day' : 'gtc',
          };

          // Use bracket order if SL and TP are set
          if (signal.stop_loss > 0 && derivedTakeProfit > 0) {
            orderBody.order_class = 'bracket';
            orderBody.take_profit = derivedTakeProfit;
            orderBody.stop_loss = signal.stop_loss;
          }

          const { data, error } = await supabase.functions.invoke('alpaca-trade', {
            body: orderBody,
          });

          if (error) {
            throw new Error(error.message || 'Broker connection failed');
          }
          if (data?.error) {
            throw new Error(data.error);
          }
          if (data?.pending === true) {
            toast.warning('Order submitted but fill not confirmed yet. Position was not created locally. It will appear after the next sync.');
            setSaving(false);
            onClose();
            return;
          }
          if (data?.success !== true) {
            throw new Error('Order was not confirmed by broker. Position not created.');
          }
          toast.success(`Orden enviada a Alpaca ${alpacaPaper ? '(Paper)' : '(Live)'}: ${data?.order?.status}`);
        } catch (err) {
          toast.error('Error al ejecutar en Alpaca');
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase.from('positions').insert({
        user_id: user.id,
        symbol: signal.asset,
        name: signal.asset,
        asset_type: signal.asset_type,
        direction: signal.direction,
        quantity,
        avg_entry: entryPrice,
        stop_loss: signal.stop_loss,
        take_profit: derivedTakeProfit,
        strategy: signal.strategy,
        strategy_family: signal.strategy_family || null,
        regime_at_entry: signal.market_regime || null,
        status: 'open',
        signal_id: signal.id,
      });

      if (error) {
        toast.error('Error al crear la posición');
        setSaving(false);
        return;
      }
      toast.success(`Posición abierta: ${signal.asset} × ${quantity} @ ${formatCurrency(entryPrice)}`);
    }

    onConfirm(signal.id);
    setSaving(false);
  };

  const newRiskDollars = riskPerUnit * quantity;
  const newRiskPct = settings.current_capital > 0 ? (newRiskDollars / settings.current_capital) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-lg space-y-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Aprobar Trade: {signal.asset}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Signal summary */}
        <div className="rounded-md bg-accent/50 p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dirección</span>
            <span className={cn("font-medium", signal.direction === 'long' ? "text-profit" : "text-loss")}>{signal.direction.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio sugerido</span>
            <span className="text-foreground">{formatCurrency(signal.entry_price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stop Loss</span>
            <span className="text-loss">{formatCurrency(signal.stop_loss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Take Profit</span>
            <span className="text-profit">{formatCurrency(derivedTakeProfit)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">R:R</span>
            <span className={cn(derivedRiskReward >= settings.min_rr_ratio ? "text-profit" : "text-loss")}>{formatNumber(derivedRiskReward)}:1</span>
          </div>
          {signal.opportunity_score != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opportunity Score</span>
              <span className={cn("font-medium", signal.opportunity_score >= 60 ? "text-profit" : signal.opportunity_score >= 45 ? "text-warning" : "text-loss")}>{signal.opportunity_score}/100</span>
            </div>
          )}
          {signal.market_regime && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Régimen</span>
              <span className="text-foreground">{signal.market_regime}</span>
            </div>
          )}
        </div>

        {/* Risk Validation Results */}
        {loaded && violations.length > 0 && (
          <div className={cn("rounded-md border p-3 space-y-2", hasBlockers ? "bg-loss/5 border-loss/30" : "bg-warning/5 border-warning/30")}>
            <h3 className="text-xs font-bold flex items-center gap-1.5">
              <AlertTriangle className={cn("h-3.5 w-3.5", hasBlockers ? "text-loss" : "text-warning")} />
              <span className={hasBlockers ? "text-loss" : "text-warning"}>
                {hasBlockers ? 'Reglas de riesgo violadas — operación bloqueada' : 'Advertencias de riesgo'}
              </span>
            </h3>
            {violations.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <StatusBadge variant={v.severity === 'block' ? 'loss' : 'warning'} dot>
                    {v.severity === 'block' ? 'BLOCK' : 'WARN'}
                  </StatusBadge>
                  <span className="text-foreground font-medium">{v.rule}</span>
                </div>
                <span className="font-mono text-muted-foreground">{v.current} / {v.limit}</span>
              </div>
            ))}
          </div>
        )}

        {loaded && violations.length === 0 && openPosition && (
          <div className="rounded-md bg-profit/5 border border-profit/30 p-3">
            <p className="text-xs text-profit flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> Todas las reglas de riesgo se cumplen
            </p>
          </div>
        )}

        {/* Open position toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={openPosition}
            onChange={(e) => setOpenPosition(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-xs text-foreground">Abrir como posición activa</span>
        </label>

        {openPosition && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Precio de entrada real</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
              {entryPrice !== signal.entry_price && (
                <p className="text-[10px] text-warning mt-1 font-mono">
                  Diferencia: {formatCurrency(Math.abs(entryPrice - signal.entry_price))} ({entryPrice > signal.entry_price ? '+' : '-'}{((Math.abs(entryPrice - signal.entry_price) / signal.entry_price) * 100).toFixed(2)}%)
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground font-mono uppercase">Cantidad / Tamaño</label>
                <button
                  onClick={() => {
                    setQuantity(idealSizeDisplay);
                    setQuantityTouched(true);
                  }}
                  className="text-[10px] text-primary hover:underline font-mono"
                >
                  Usar ideal: {idealSizeDisplay}
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={quantityTouched || quantity !== 0 ? quantity : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || val === '.') {
                    setQuantity(0);
                    setQuantityTouched(true);
                    return;
                  }
                  const num = Number(val);
                  if (!isNaN(num) && num >= 0) {
                    setQuantity(num);
                    setQuantityTouched(true);
                  }
                }}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* Risk summary for this trade */}
            <div className="rounded-md bg-accent/30 p-2.5 space-y-1 text-[10px] font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Riesgo de esta operación</span>
                <span className={cn(newRiskPct > settings.risk_per_trade ? "text-loss" : "text-foreground")}>
                  {formatCurrency(newRiskDollars)} ({formatNumber(newRiskPct)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total de la posición</span>
                <span className="text-foreground">{formatCurrency(quantity * entryPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Posiciones después</span>
                <span className="text-foreground">{openPositionsCount + 1} / {settings.max_positions}</span>
              </div>
            </div>
          </div>
        )}

        {/* Alpaca execution toggle */}
        {openPosition && (signal.asset_type === 'stock' || signal.asset_type === 'etf' || signal.asset_type === 'crypto') && (
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={executeOnAlpaca}
                onChange={(e) => setExecuteOnAlpaca(e.target.checked)}
                className="rounded border-border"
              />
              <div className="flex items-center gap-1.5">
                {executeOnAlpaca ? <Wifi className="h-3.5 w-3.5 text-lime-400" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs text-foreground">Ejecutar orden en Alpaca Markets</span>
              </div>
            </label>
            {executeOnAlpaca && (
              <div className="flex items-center gap-2 pl-8">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={alpacaPaper}
                    onChange={() => setAlpacaPaper(true)}
                    className="border-border"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">Paper Trading</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={!alpacaPaper}
                    onChange={() => setAlpacaPaper(false)}
                    className="border-border"
                  />
                  <span className="text-[10px] text-loss font-mono font-bold">⚠ Live Trading</span>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (hasBlockers && openPosition)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-colors disabled:opacity-50",
              hasBlockers && openPosition
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-profit text-profit-foreground hover:bg-profit/90"
            )}
          >
            {hasBlockers && openPosition ? (
              <><AlertTriangle className="h-3.5 w-3.5" /> Bloqueado por Riesgo</>
            ) : (
              <><Check className="h-3.5 w-3.5" /> {saving ? 'Guardando...' : openPosition ? 'Aprobar y Abrir Posición' : 'Aprobar'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
