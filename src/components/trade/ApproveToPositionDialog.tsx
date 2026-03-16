import { useState } from "react";
import { Check, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/mockData";

interface TradeSignal {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  direction: string;
  strategy: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number | null;
}

interface Props {
  signal: TradeSignal;
  onClose: () => void;
  onConfirm: (signalId: string) => void;
}

export default function ApproveToPositionDialog({ signal, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const [entryPrice, setEntryPrice] = useState(signal.entry_price);
  const [quantity, setQuantity] = useState(signal.position_size || 1);
  const [saving, setSaving] = useState(false);
  const [openPosition, setOpenPosition] = useState(true);

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);

    if (openPosition) {
      const { error } = await supabase.from('positions').insert({
        user_id: user.id,
        symbol: signal.symbol,
        name: signal.name,
        asset_type: signal.asset_type,
        direction: signal.direction,
        quantity,
        avg_entry: entryPrice,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        strategy: signal.strategy,
        status: 'open',
        signal_id: signal.id,
      });

      if (error) {
        toast.error('Error al crear la posición');
        setSaving(false);
        return;
      }
      toast.success(`Posición abierta: ${signal.symbol} @ ${formatCurrency(entryPrice)}`);
    }

    onConfirm(signal.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Aprobar Trade: {signal.symbol}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Signal summary */}
        <div className="rounded-md bg-accent/50 p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dirección</span>
            <span className="text-foreground">{signal.direction.toUpperCase()}</span>
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
            <span className="text-profit">{formatCurrency(signal.take_profit)}</span>
          </div>
        </div>

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
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Cantidad / Tamaño</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-profit text-profit-foreground rounded-md text-xs font-bold hover:bg-profit/90 transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? 'Guardando...' : openPosition ? 'Aprobar y Abrir Posición' : 'Aprobar'}
          </button>
        </div>
      </div>
    </div>
  );
}
