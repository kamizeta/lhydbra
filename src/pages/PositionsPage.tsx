import { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, X, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n';
import { useMarketData } from '@/hooks/useMarketData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/mockData';
import ClosePositionDialog from '@/components/trade/ClosePositionDialog';
import PositionSignalDetail from '@/components/trade/PositionSignalDetail';

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
  strategy: string | null;
  status: string;
  opened_at: string;
  signal_id: string | null;
}

export default function PositionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [viewSignalId, setViewSignalId] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: '', name: '', asset_type: 'stock', direction: 'long',
    quantity: 0, avg_entry: 0, stop_loss: 0, take_profit: 0, strategy: '',
  });

  const { data: marketAssets } = useMarketData();

  const priceMap = useMemo(() => {
    const map = new Map<string, { price: number; isMock: boolean }>();
    if (!marketAssets) return map;
    for (const asset of marketAssets) {
      map.set(asset.symbol, { price: asset.price, isMock: !!asset.isMock });
      map.set(asset.symbol.replace('/', ''), { price: asset.price, isMock: !!asset.isMock });
    }
    return map;
  }, [marketAssets]);

  const getPnL = (pos: Position) => {
    const lookup = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
    if (!lookup) return null;
    const currentPrice = lookup.price;
    const diff = pos.direction === 'long' ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice;
    return { pnl: diff * pos.quantity, pnlPercent: (diff / pos.avg_entry) * 100, currentPrice, isMock: lookup.isMock };
  };

  const totalPnL = useMemo(() => {
    let total = 0;
    for (const pos of positions) {
      const result = getPnL(pos);
      if (result) total += result.pnl;
    }
    return total;
  }, [positions, priceMap]);

  useEffect(() => { if (user) loadPositions(); }, [user]);

  const loadPositions = async () => {
    const { data } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    setPositions((data as Position[]) || []);
    setLoading(false);
  };

  const addPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('positions').insert({
      user_id: user!.id, symbol: form.symbol.toUpperCase(), name: form.name,
      asset_type: form.asset_type, direction: form.direction, quantity: form.quantity,
      avg_entry: form.avg_entry, stop_loss: form.stop_loss || null,
      take_profit: form.take_profit || null, strategy: form.strategy || null,
    });
    if (error) { toast.error('Error adding position'); }
    else {
      toast.success('Position added');
      setShowForm(false);
      setForm({ symbol: '', name: '', asset_type: 'stock', direction: 'long', quantity: 0, avg_entry: 0, stop_loss: 0, take_profit: 0, strategy: '' });
      loadPositions();
    }
  };

  const deletePosition = async (id: string) => {
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (!error) { toast.success('Position deleted'); setPositions(prev => prev.filter(p => p.id !== id)); }
  };

  const handlePositionClosed = () => {
    setClosingPosition(null);
    loadPositions();
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.dashboard.openPositions}</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground font-mono">{positions.length} {t.common.active}</p>
            {positions.length > 0 && (
              <span className={cn("text-sm font-mono font-bold", totalPnL >= 0 ? "text-profit" : "text-loss")}>
                PnL Total: {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'New Position'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addPosition} className="terminal-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Symbol', key: 'symbol', type: 'text' },
              { label: 'Name', key: 'name', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} required
                  className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Type</label>
              <select value={form.asset_type} onChange={(e) => setForm(f => ({ ...f, asset_type: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="stock">{t.common.stocks}</option><option value="crypto">{t.common.crypto}</option>
                <option value="etf">{t.common.etfs}</option><option value="forex">{t.common.forex}</option>
                <option value="commodity">{t.common.commodities}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Direction</label>
              <select value={form.direction} onChange={(e) => setForm(f => ({ ...f, direction: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="long">LONG</option><option value="short">SHORT</option>
              </select>
            </div>
            {['quantity', 'avg_entry', 'stop_loss', 'take_profit'].map(key => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">
                  {key === 'avg_entry' ? t.common.entry : key === 'stop_loss' ? t.common.stopLoss : key === 'take_profit' ? t.common.takeProfit : 'Quantity'}
                </label>
                <input type="number" step="any" value={(form as any)[key]} onChange={(e) => setForm(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  required={key === 'quantity' || key === 'avg_entry'}
                  className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{t.common.strategy}</label>
              <input type="text" value={form.strategy} onChange={(e) => setForm(f => ({ ...f, strategy: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-colors">Add</button>
          </div>
        </form>
      )}

      {/* Positions Table */}
      <div className="terminal-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left p-3">{t.common.asset}</th>
              <th className="text-center p-3">Dir</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">{t.common.entry}</th>
              <th className="text-right p-3">Actual</th>
              <th className="text-right p-3">PnL</th>
              <th className="text-right p-3">SL</th>
              <th className="text-right p-3">TP</th>
              <th className="text-right p-3">{t.common.strategy}</th>
              <th className="text-center p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground text-xs font-mono">No open positions</td></tr>
            ) : positions.map((pos) => {
              const pnlData = getPnL(pos);
              return (
                <tr key={pos.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => pos.signal_id && setViewSignalId(pos.signal_id)}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-mono font-medium text-foreground">{pos.symbol}</div>
                        <div className="text-xs text-muted-foreground">{pos.name}</div>
                      </div>
                      {pos.signal_id && (
                        <Lightbulb className="h-3 w-3 text-primary/60" />
                      )}
                    </div>
                  </td>
                  <td className="text-center p-3">
                    <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>
                      {pos.direction === 'long' ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                      {' '}{pos.direction.toUpperCase()}
                    </StatusBadge>
                  </td>
                  <td className="text-right p-3 font-mono text-foreground">{pos.quantity}</td>
                  <td className="text-right p-3 font-mono text-foreground">{formatCurrency(pos.avg_entry)}</td>
                  <td className="text-right p-3 font-mono">
                    {pnlData ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-foreground">{formatCurrency(pnlData.currentPrice)}</span>
                        {pnlData.isMock && <AlertTriangle className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-right p-3 font-mono">
                    {pnlData ? (
                      <div>
                        <span className={cn("font-bold", pnlData.pnl >= 0 ? "text-profit" : "text-loss")}>
                          {pnlData.pnl >= 0 ? '+' : ''}{formatCurrency(pnlData.pnl)}
                        </span>
                        <div className={cn("text-[10px]", pnlData.pnlPercent >= 0 ? "text-profit" : "text-loss")}>
                          {pnlData.pnlPercent >= 0 ? '+' : ''}{pnlData.pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground text-[10px]">Sin precio</span>}
                  </td>
                  <td className="text-right p-3 font-mono text-loss">{pos.stop_loss ? formatCurrency(Number(pos.stop_loss)) : '—'}</td>
                  <td className="text-right p-3 font-mono text-profit">{pos.take_profit ? formatCurrency(Number(pos.take_profit)) : '—'}</td>
                  <td className="text-right p-3"><StatusBadge variant="info">{pos.strategy || '—'}</StatusBadge></td>
                  <td className="text-center p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setClosingPosition(pos); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-loss/10 text-loss hover:bg-loss/20 transition-colors text-[10px] font-bold"
                        title="Cerrar posición">
                        <DollarSign className="h-3 w-3" /> Cerrar
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deletePosition(pos.id); }}
                        className="p-1 text-muted-foreground hover:text-loss transition-colors" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Close Position Dialog */}
      {closingPosition && (
        <ClosePositionDialog
          position={closingPosition}
          currentPrice={getPnL(closingPosition)?.currentPrice || null}
          onClose={() => setClosingPosition(null)}
          onConfirm={handlePositionClosed}
        />
      )}

      {/* Signal Detail from Position */}
      {viewSignalId && (
        <PositionSignalDetail
          signalId={viewSignalId}
          onClose={() => setViewSignalId(null)}
        />
      )}
    </div>
  );
}
