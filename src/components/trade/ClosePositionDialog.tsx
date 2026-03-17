import { useState } from "react";
import { X, DollarSign, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/mockData";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  signal_id: string | null;
  strategy_family?: string | null;
  regime_at_entry?: string | null;
  strategy?: string | null;
}

interface Props {
  position: Position;
  currentPrice: number | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ClosePositionDialog({ position, currentPrice, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const [closePrice, setClosePrice] = useState(currentPrice || position.avg_entry);
  const [saving, setSaving] = useState(false);
  const [executeOnBinance, setExecuteOnBinance] = useState(false);
  const [executeOnAlpaca, setExecuteOnAlpaca] = useState(false);
  const [alpacaPaper, setAlpacaPaper] = useState(true);
  const [hasBinanceKeys, setHasBinanceKeys] = useState<boolean | null>(null);

  // Check Binance keys on mount
  useState(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("binance_api_key, binance_api_secret")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const has = !!(data as any)?.binance_api_key && !!(data as any)?.binance_api_secret;
        setHasBinanceKeys(has);
        if (has && position.asset_type === 'crypto') setExecuteOnBinance(true);
      });
  });

  const diff = position.direction === 'long'
    ? closePrice - position.avg_entry
    : position.avg_entry - closePrice;
  const pnl = diff * position.quantity;
  const pnlPercent = (diff / position.avg_entry) * 100;

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);

    // Execute on Binance if enabled
    if (executeOnBinance) {
      try {
        const binanceSymbol = position.symbol.replace('/', '').replace('-', '');
        const side = position.direction === 'long' ? 'SELL' : 'BUY';
        
        const { data, error } = await supabase.functions.invoke('binance-trade', {
          body: {
            action: 'place_order',
            symbol: binanceSymbol,
            side,
            quantity: position.quantity,
            type: 'MARKET',
          },
        });

        if (error || data?.error) {
          toast.error(`Binance: ${data?.error || error?.message}`);
          setSaving(false);
          return;
        }
        toast.success('Orden ejecutada en Binance');
      } catch (err) {
        toast.error('Error al ejecutar en Binance');
        setSaving(false);
        return;
      }
    }

    // Execute on Alpaca if enabled
    if (executeOnAlpaca) {
      try {
        const { data, error } = await supabase.functions.invoke('alpaca-trade', {
          body: {
            action: 'close_position',
            paper: alpacaPaper,
            symbol: position.symbol.replace('/', ''),
            qty: position.quantity,
          },
        });

        if (error || data?.error) {
          toast.error(`Alpaca: ${data?.error || error?.message}`);
          setSaving(false);
          return;
        }
        toast.success(`Orden de cierre enviada a Alpaca ${alpacaPaper ? '(Paper)' : '(Live)'}`);
      } catch (err) {
        toast.error('Error al ejecutar en Alpaca');
        setSaving(false);
        return;
      }
    }

    // Update position in DB
    const { error } = await supabase.from('positions').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      close_price: closePrice,
      pnl,
    }).eq('id', position.id);

    if (error) {
      toast.error('Error al cerrar posición');
      setSaving(false);
      return;
    }

    toast.success(`Posición cerrada: ${position.symbol} — PnL: ${formatCurrency(pnl)}`);
    setSaving(false);
    onConfirm();
  };

  const isAlpacaEligible = position.asset_type === 'stock' || position.asset_type === 'etf' || position.asset_type === 'crypto';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Cerrar Posición: {position.symbol}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-md bg-accent/50 p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dirección</span>
            <span className="text-foreground">{position.direction.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entrada</span>
            <span className="text-foreground">{formatCurrency(position.avg_entry)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cantidad</span>
            <span className="text-foreground">{position.quantity}</span>
          </div>
        </div>

        {/* Close price */}
        <div>
          <label className="text-[10px] text-muted-foreground font-mono uppercase">Precio de cierre</label>
          <input
            type="number"
            step="any"
            value={closePrice}
            onChange={(e) => setClosePrice(Number(e.target.value))}
            className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        {/* PnL preview */}
        <div className={cn(
          "rounded-md p-3 text-center",
          pnl >= 0 ? "bg-profit/10 border border-profit/20" : "bg-loss/10 border border-loss/20"
        )}>
          <div className="text-[10px] text-muted-foreground font-mono uppercase">PnL Estimado</div>
          <div className={cn("text-lg font-mono font-bold", pnl >= 0 ? "text-profit" : "text-loss")}>
            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
          </div>
          <div className={cn("text-xs font-mono", pnl >= 0 ? "text-profit" : "text-loss")}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </div>
        </div>

        {/* Binance toggle */}
        {hasBinanceKeys && position.asset_type === 'crypto' && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={executeOnBinance}
              onChange={(e) => setExecuteOnBinance(e.target.checked)}
              className="rounded border-border"
            />
            <div className="flex items-center gap-1.5">
              {executeOnBinance ? <Wifi className="h-3.5 w-3.5 text-profit" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-xs text-foreground">Ejecutar orden en Binance</span>
            </div>
          </label>
        )}

        {/* Alpaca toggle */}
        {isAlpacaEligible && (
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
                <span className="text-xs text-foreground">Ejecutar cierre en Alpaca Markets</span>
              </div>
            </label>
            {executeOnAlpaca && (
              <div className="flex items-center gap-2 pl-8">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={alpacaPaper} onChange={() => setAlpacaPaper(true)} className="border-border" />
                  <span className="text-[10px] text-muted-foreground font-mono">Paper</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!alpacaPaper} onChange={() => setAlpacaPaper(false)} className="border-border" />
                  <span className="text-[10px] text-loss font-mono font-bold">⚠ Live</span>
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
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-loss text-loss-foreground rounded-md text-xs font-bold hover:bg-loss/90 transition-colors disabled:opacity-50"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {saving ? 'Cerrando...' : 'Cerrar Posición'}
          </button>
        </div>
      </div>
    </div>
  );
}