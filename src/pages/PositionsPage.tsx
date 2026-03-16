import { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, X, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, DollarSign, PieChart, Pencil, Check } from 'lucide-react';
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
import PortfolioEngine from '@/components/trade/PortfolioEngine';

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
  const [editingSlTp, setEditingSlTp] = useState<{ id: string; sl: string; tp: string } | null>(null);
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

  const { totalPnL, totalPnLPercent } = useMemo(() => {
    let total = 0;
    let totalCapital = 0;
    for (const pos of positions) {
      const result = getPnL(pos);
      totalCapital += pos.quantity * pos.avg_entry;
      if (result) total += result.pnl;
    }
    return { totalPnL: total, totalPnLPercent: totalCapital > 0 ? (total / totalCapital) * 100 : 0 };
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

  const checkSlTpHit = (pos: Position, currentPrice: number | undefined) => {
    if (!currentPrice) return { hitSl: false, hitTp: false };
    const hitSl = pos.stop_loss != null && (
      pos.direction === 'long' ? currentPrice <= Number(pos.stop_loss) : currentPrice >= Number(pos.stop_loss)
    );
    const hitTp = pos.take_profit != null && (
      pos.direction === 'long' ? currentPrice >= Number(pos.take_profit) : currentPrice <= Number(pos.take_profit)
    );
    return { hitSl, hitTp };
  };

  const saveSlTp = async () => {
    if (!editingSlTp) return;
    const { error } = await supabase.from('positions').update({
      stop_loss: editingSlTp.sl ? Number(editingSlTp.sl) : null,
      take_profit: editingSlTp.tp ? Number(editingSlTp.tp) : null,
    }).eq('id', editingSlTp.id);
    if (error) toast.error('Error updating SL/TP');
    else { toast.success('SL/TP updated'); setEditingSlTp(null); loadPositions(); }
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
                PnL Total: {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
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
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="text-left p-2 w-[14%]">{t.common.asset}</th>
              <th className="text-center p-2 w-[7%]">Dir</th>
              <th className="text-right p-2 w-[7%]">Qty</th>
              <th className="text-right p-2 w-[9%]">{t.common.entry}</th>
              <th className="text-right p-2 w-[9%]">Capital</th>
              <th className="text-right p-2 w-[9%]">Actual</th>
              <th className="text-right p-2 w-[11%]">PnL</th>
              <th className="text-right p-2 w-[8%]">SL</th>
              <th className="text-right p-2 w-[8%]">TP</th>
              <th className="text-right p-2 w-[8%]">{t.common.strategy}</th>
              <th className="text-center p-2 w-[10%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={11} className="p-6 text-center text-muted-foreground text-xs font-mono">No open positions</td></tr>
            ) : positions.map((pos) => {
              const pnlData = getPnL(pos);
              const capitalUsed = pos.quantity * pos.avg_entry;
              const { hitSl, hitTp } = checkSlTpHit(pos, pnlData?.currentPrice);
              const isEditing = editingSlTp?.id === pos.id;

              return (
                <tr key={pos.id} className={cn(
                  "border-b border-border/50 transition-colors cursor-pointer",
                  (hitSl || hitTp) ? "bg-warning/15 border-warning/40" : "hover:bg-accent/30"
                )}
                  onClick={() => pos.signal_id && setViewSignalId(pos.signal_id)}>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0">
                        <div className="font-mono font-medium text-foreground text-xs truncate">{pos.symbol}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{pos.name}</div>
                      </div>
                      {pos.signal_id && <Lightbulb className="h-3 w-3 text-primary/60 shrink-0" />}
                      {(hitSl || hitTp) && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded border border-warning bg-warning/20 text-warning text-[9px] font-bold whitespace-nowrap shrink-0">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {hitSl ? 'SL' : 'TP'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-center p-2">
                    <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>
                      {pos.direction === 'long' ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                      {' '}{pos.direction.toUpperCase()}
                    </StatusBadge>
                  </td>
                  <td className="text-right p-2 font-mono text-xs text-foreground">{pos.quantity.toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs text-foreground">${pos.avg_entry.toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs text-muted-foreground">${capitalUsed.toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs">
                    {pnlData ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-foreground">${pnlData.currentPrice.toFixed(2)}</span>
                        {pnlData.isMock && <AlertTriangle className="h-2.5 w-2.5 text-muted-foreground" />}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-right p-2 font-mono text-xs">
                    {pnlData ? (
                      <div>
                        <span className={cn("font-bold", pnlData.pnl >= 0 ? "text-profit" : "text-loss")}>
                          {pnlData.pnl >= 0 ? '+' : ''}${pnlData.pnl.toFixed(2)}
                        </span>
                        <div className={cn("text-[10px]", pnlData.pnlPercent >= 0 ? "text-profit" : "text-loss")}>
                          {pnlData.pnlPercent >= 0 ? '+' : ''}{pnlData.pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground text-[10px]">Sin precio</span>}
                  </td>
                  <td className="text-right p-2 font-mono text-xs" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <input type="number" step="any" value={editingSlTp.sl}
                        onChange={e => setEditingSlTp(prev => prev ? { ...prev, sl: e.target.value } : null)}
                        className="w-16 px-1 py-0.5 bg-background border border-border rounded text-[10px] text-loss font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
                    ) : (
                      <span className={cn(hitSl ? "text-warning font-bold" : "text-loss")}>
                        {pos.stop_loss ? `$${Number(pos.stop_loss).toFixed(2)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="text-right p-2 font-mono text-xs" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <input type="number" step="any" value={editingSlTp.tp}
                        onChange={e => setEditingSlTp(prev => prev ? { ...prev, tp: e.target.value } : null)}
                        className="w-16 px-1 py-0.5 bg-background border border-border rounded text-[10px] text-profit font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
                    ) : (
                      <span className={cn(hitTp ? "text-warning font-bold" : "text-profit")}>
                        {pos.take_profit ? `$${Number(pos.take_profit).toFixed(2)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="text-right p-2"><StatusBadge variant="info">{pos.strategy || '—'}</StatusBadge></td>
                  <td className="text-center p-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      {isEditing ? (
                        <button onClick={saveSlTp}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-profit/10 text-profit hover:bg-profit/20 transition-colors text-[10px] font-bold">
                          <Check className="h-3 w-3" /> OK
                        </button>
                      ) : (
                        <button onClick={() => setEditingSlTp({ id: pos.id, sl: pos.stop_loss?.toString() || '', tp: pos.take_profit?.toString() || '' })}
                          className="p-0.5 text-muted-foreground hover:text-primary transition-colors" title="Editar SL/TP">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button onClick={() => setClosingPosition(pos)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-loss/10 text-loss hover:bg-loss/20 transition-colors text-[10px] font-bold"
                        title="Cerrar posición">
                        <DollarSign className="h-3 w-3" />
                      </button>
                      <button onClick={() => deletePosition(pos.id)}
                        className="p-0.5 text-muted-foreground hover:text-loss transition-colors" title="Delete">
                        <Trash2 className="h-3 w-3" />
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

      {/* Portfolio Engine - Rebalancing Recommendations */}
      <div className="terminal-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <PieChart className="h-4 w-4 text-primary" /> Portfolio Engine — Rebalanceo
        </h2>
        <PortfolioEngine />
      </div>

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
