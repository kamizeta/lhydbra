import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Plus, X, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, DollarSign, PieChart, Pencil, Check, RefreshCw, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n';
import { useMarketData } from '@/hooks/useMarketData';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/utils';
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
  strategy_family: string | null;
  regime_at_entry: string | null;
  status: string;
  opened_at: string;
  signal_id: string | null;
  pnl: number | null;
}

type SortKey = 'symbol' | 'direction' | 'quantity' | 'avg_entry' | 'capital' | 'current' | 'pnl' | 'pnlPercent' | 'stop_loss' | 'take_profit' | 'strategy' | 'opened_at';
type SortDir = 'asc' | 'desc';

export default function PositionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [viewSignalId, setViewSignalId] = useState<string | null>(null);
  const [editingSlTp, setEditingSlTp] = useState<{ id: string; sl: string; tp: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ changes: { action: string; symbol: string; detail: string }[]; synced_at: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('opened_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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
    const currentPrice = lookup && !lookup.isMock ? lookup.price : null;
    const qty = Math.abs(pos.quantity);
    const fallbackPnl = currentPrice != null
      ? (pos.direction === 'long' ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice) * qty
      : null;
    const pnl = pos.pnl ?? fallbackPnl;
    if (pnl == null) return null;
    const pnlPercent = qty > 0 && pos.avg_entry > 0 ? (pnl / (qty * pos.avg_entry)) * 100 : 0;
    return { pnl, pnlPercent, currentPrice, isMock: false };
  };

  const { totalPnL, totalPnLPercent } = useMemo(() => {
    let total = 0;
    let totalCapital = 0;
    for (const pos of positions) {
      const result = getPnL(pos);
      totalCapital += Math.abs(pos.quantity) * pos.avg_entry;
      if (result) total += result.pnl;
    }
    return { totalPnL: total, totalPnLPercent: totalCapital > 0 ? (total / totalCapital) * 100 : 0 };
  }, [positions, priceMap]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const pnlA = getPnL(a);
      const pnlB = getPnL(b);
      switch (sortKey) {
        case 'symbol': return dir * a.symbol.localeCompare(b.symbol);
        case 'direction': return dir * a.direction.localeCompare(b.direction);
        case 'quantity': return dir * (a.quantity - b.quantity);
        case 'avg_entry': return dir * (a.avg_entry - b.avg_entry);
        case 'capital': return dir * ((a.quantity * a.avg_entry) - (b.quantity * b.avg_entry));
        case 'current': return dir * ((pnlA?.currentPrice || 0) - (pnlB?.currentPrice || 0));
        case 'pnl': return dir * ((pnlA?.pnl || 0) - (pnlB?.pnl || 0));
        case 'pnlPercent': return dir * ((pnlA?.pnlPercent || 0) - (pnlB?.pnlPercent || 0));
        case 'stop_loss': return dir * ((Number(a.stop_loss) || 0) - (Number(b.stop_loss) || 0));
        case 'take_profit': return dir * ((Number(a.take_profit) || 0) - (Number(b.take_profit) || 0));
        case 'strategy': return dir * ((a.strategy || '').localeCompare(b.strategy || ''));
        case 'opened_at': return dir * (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
        default: return 0;
      }
    });
  }, [positions, sortKey, sortDir, priceMap]);



  const loadPositions = useCallback(async () => {
    if (!user) {
      setPositions([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    if (error) {
      toast.error('Error loading positions');
      setPositions([]);
    } else {
      setPositions((data as Position[]) || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadPositions();
  }, [user, loadPositions]);

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
      void loadPositions();
    }
  };

  const deletePosition = async (id: string) => {
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (!error) { toast.success('Position deleted'); setPositions(prev => prev.filter(p => p.id !== id)); }
  };

  const syncAlpaca = useCallback(async (paper = true) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('alpaca-sync', { body: { paper } });
      if (error || data?.error) {
        toast.error(`Sync error: ${data?.error || error?.message}`);
      } else {
        const changes = data?.changes || [];
        setSyncResult({ changes, synced_at: data?.synced_at });
        await loadPositions();
        if (changes.length > 0) {
          toast.success(`Alpaca sync: ${changes.length} cambio(s)`);
        } else {
          toast.info('Alpaca sync: sin cambios');
        }
      }
    } catch { toast.error('Error sync Alpaca'); }
    setSyncing(false);
  }, [loadPositions]);

  useEffect(() => {
    if (user && !loading) {
      const timer = setTimeout(() => void syncAlpaca(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [user, loading, syncAlpaca]);

  const handlePositionClosed = () => { setClosingPosition(null); loadPositions(); };

  const checkSlTpHit = (pos: Position, currentPrice: number | undefined) => {
    if (!currentPrice) return { hitSl: false, hitTp: false };
    const hitSl = pos.stop_loss != null && (pos.direction === 'long' ? currentPrice <= Number(pos.stop_loss) : currentPrice >= Number(pos.stop_loss));
    const hitTp = pos.take_profit != null && (pos.direction === 'long' ? currentPrice >= Number(pos.take_profit) : currentPrice <= Number(pos.take_profit));
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

  // Format price compactly
  const fmtPrice = (n: number | null | undefined) => {
    if (n == null || isNaN(Number(n))) return '—';
    const v = Number(n);
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toPrecision(3)}`;
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-foreground">{t.dashboard.openPositions}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">{positions.length} {t.common.active}</span>
            {positions.length > 0 && (
              <span className={cn("text-xs font-mono font-bold", totalPnL >= 0 ? "text-profit" : "text-loss")}>
                PnL: {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => syncAlpaca(true)} disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-[10px] md:text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-colors">
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{showForm ? 'Cancel' : 'New'}</span>
          </button>
        </div>
      </div>

      {/* Sync results banner */}
      {syncResult && syncResult.changes.length > 0 && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-primary flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Sync — {syncResult.changes.length} cambio(s)
            </span>
            <button onClick={() => setSyncResult(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          {syncResult.changes.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className={cn("px-1 py-0.5 rounded font-bold uppercase",
                c.action === 'opened' ? "bg-profit/10 text-profit" : c.action === 'closed' ? "bg-loss/10 text-loss" : "bg-warning/10 text-warning"
              )}>{c.action}</span>
              <span className="text-foreground font-medium">{c.symbol}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={addPosition} className="terminal-border rounded-lg p-3 md:p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
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
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Dir</label>
              <select value={form.direction} onChange={(e) => setForm(f => ({ ...f, direction: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="long">LONG</option><option value="short">SHORT</option>
              </select>
            </div>
            {['quantity', 'avg_entry', 'stop_loss', 'take_profit'].map(key => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">
                  {key === 'avg_entry' ? 'Entry' : key === 'stop_loss' ? 'SL' : key === 'take_profit' ? 'TP' : 'Qty'}
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

      {/* ─── MOBILE: Card layout ─── */}
      <div className="md:hidden space-y-2">
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs font-mono">No open positions</div>
        ) : positions.map((pos) => {
          const pnlData = getPnL(pos);
          const { hitSl, hitTp } = checkSlTpHit(pos, pnlData?.currentPrice);
          const isEditing = editingSlTp?.id === pos.id;

          return (
            <div key={pos.id}
              onClick={() => pos.signal_id && setViewSignalId(pos.signal_id)}
              className={cn(
                "terminal-border rounded-lg p-3 space-y-2 transition-colors",
                (hitSl || hitTp) ? "border-warning/40 bg-warning/5" : ""
              )}>
              {/* Row 1: Symbol + Direction + PnL */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-foreground">{pos.symbol}</span>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                    pos.direction === 'long' ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
                  )}>
                    {pos.direction === 'long' ? '▲' : '▼'} {pos.direction.toUpperCase()}
                  </span>
                  {pos.signal_id && <Lightbulb className="h-3 w-3 text-primary/60" />}
                  {(hitSl || hitTp) && (
                    <span className="text-[9px] font-bold text-warning flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" /> {hitSl ? 'SL HIT' : 'TP HIT'}
                    </span>
                  )}
                </div>
                {pnlData && (
                  <div className="text-right">
                    <span className={cn("font-mono font-bold text-sm", pnlData.pnl >= 0 ? "text-profit" : "text-loss")}>
                      {pnlData.pnl >= 0 ? '+' : '-'}{fmtPrice(Math.abs(pnlData.pnl))}
                    </span>
                    <div className={cn("text-[10px] font-mono", pnlData.pnlPercent >= 0 ? "text-profit" : "text-loss")}>
                      {pnlData.pnlPercent != null ? `${pnlData.pnlPercent >= 0 ? '+' : ''}${pnlData.pnlPercent.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Key metrics grid */}
              <div className="grid grid-cols-5 gap-2 text-[10px] font-mono">
                <div>
                  <span className="text-muted-foreground">Qty</span>
                  <div className="text-foreground">{Math.abs(pos.quantity)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Entry</span>
                  <div className="text-foreground">{fmtPrice(pos.avg_entry)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Now</span>
                  <div className="text-foreground">{pnlData ? fmtPrice(pnlData.currentPrice) : '—'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Strat</span>
                  <div className="text-foreground truncate">{pos.strategy || '—'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha</span>
                  <div className="text-foreground">{new Date(pos.opened_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</div>
                </div>
              </div>

              {/* Row 3: SL/TP + Actions */}
              <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  {isEditing ? (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-loss">SL:</span>
                        <input type="number" step="any" value={editingSlTp.sl}
                          onChange={e => setEditingSlTp(prev => prev ? { ...prev, sl: e.target.value } : null)}
                          className="w-14 px-1 py-0.5 bg-background border border-border rounded text-[10px] text-loss font-mono" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-profit">TP:</span>
                        <input type="number" step="any" value={editingSlTp.tp}
                          onChange={e => setEditingSlTp(prev => prev ? { ...prev, tp: e.target.value } : null)}
                          className="w-14 px-1 py-0.5 bg-background border border-border rounded text-[10px] text-profit font-mono" />
                      </div>
                    </>
                  ) : (
                    <>
                      <span><span className={cn(hitSl ? "text-warning font-bold" : "text-loss")}>SL: {pos.stop_loss ? fmtPrice(Number(pos.stop_loss)) : '—'}</span></span>
                      <span><span className={cn(hitTp ? "text-warning font-bold" : "text-profit")}>TP: {pos.take_profit ? fmtPrice(Number(pos.take_profit)) : '—'}</span></span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <button onClick={saveSlTp} className="p-1 rounded bg-profit/10 text-profit hover:bg-profit/20">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button onClick={() => setEditingSlTp({ id: pos.id, sl: pos.stop_loss?.toString() || '', tp: pos.take_profit?.toString() || '' })}
                      className="p-1 text-muted-foreground hover:text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => setClosingPosition(pos)} className="p-1 rounded bg-loss/10 text-loss hover:bg-loss/20">
                    <DollarSign className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deletePosition(pos.id)} className="p-1 text-muted-foreground hover:text-loss">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── DESKTOP: Table layout ─── */}
      <div className="hidden md:block terminal-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
              {([
                { key: 'symbol' as SortKey, label: t.common.asset, align: 'text-left', w: 'w-[12%]' },
                { key: 'direction' as SortKey, label: 'Dir', align: 'text-center', w: 'w-[6%]' },
                { key: 'quantity' as SortKey, label: 'Qty', align: 'text-right', w: 'w-[6%]' },
                { key: 'avg_entry' as SortKey, label: t.common.entry, align: 'text-right', w: 'w-[8%]' },
                { key: 'capital' as SortKey, label: 'Capital', align: 'text-right', w: 'w-[8%]' },
                { key: 'current' as SortKey, label: 'Actual', align: 'text-right', w: 'w-[8%]' },
                { key: 'pnl' as SortKey, label: 'PnL', align: 'text-right', w: 'w-[10%]' },
                { key: 'stop_loss' as SortKey, label: 'SL', align: 'text-right', w: 'w-[7%]' },
                { key: 'take_profit' as SortKey, label: 'TP', align: 'text-right', w: 'w-[7%]' },
                { key: 'strategy' as SortKey, label: t.common.strategy, align: 'text-right', w: 'w-[8%]' },
                { key: 'opened_at' as SortKey, label: 'Fecha', align: 'text-right', w: 'w-[8%]' },
              ]).map(col => (
                <th key={col.key} className={cn(col.align, 'p-2 cursor-pointer select-none hover:text-foreground transition-colors', col.w)}
                  onClick={() => { if (sortKey === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(col.key); setSortDir('desc'); } }}>
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
                  </span>
                </th>
              ))}
              <th className="text-center p-2 w-[8%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={12} className="p-6 text-center text-muted-foreground text-xs font-mono">No open positions</td></tr>
            ) : sortedPositions.map((pos) => {
              const pnlData = getPnL(pos);
              const capitalUsed = Math.abs(pos.quantity) * pos.avg_entry;
              const { hitSl, hitTp } = checkSlTpHit(pos, pnlData?.currentPrice);
              const isEditing = editingSlTp?.id === pos.id;

              return (
                <tr key={pos.id} className={cn(
                  "border-b border-border/50 transition-colors cursor-pointer",
                  (hitSl || hitTp) ? "bg-warning/15 border-warning/40" : "hover:bg-accent/30"
                )} onClick={() => pos.signal_id && setViewSignalId(pos.signal_id)}>
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
                  <td className="text-right p-2 font-mono text-xs text-foreground">{Math.abs(pos.quantity).toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs text-foreground">${pos.avg_entry.toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs text-muted-foreground">${capitalUsed.toFixed(2)}</td>
                  <td className="text-right p-2 font-mono text-xs">
                    {pnlData ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-foreground">{pnlData.currentPrice != null ? `$${pnlData.currentPrice.toFixed(2)}` : '—'}</span>
                        {pnlData.isMock && <AlertTriangle className="h-2.5 w-2.5 text-muted-foreground" />}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-right p-2 font-mono text-xs">
                    {pnlData ? (
                      <div>
                        <span className={cn("font-bold", pnlData.pnl >= 0 ? "text-profit" : "text-loss")}>
                         {pnlData.pnl != null ? `${pnlData.pnl >= 0 ? '+' : ''}$${pnlData.pnl.toFixed(2)}` : '—'}
                       </span>
                       <div className={cn("text-[10px]", (pnlData.pnlPercent ?? 0) >= 0 ? "text-profit" : "text-loss")}>
                         {pnlData.pnlPercent != null ? `${pnlData.pnlPercent >= 0 ? '+' : ''}${pnlData.pnlPercent.toFixed(2)}%` : ''}
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
                  <td className="text-right p-2 font-mono text-[10px] text-muted-foreground">
                    {new Date(pos.opened_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </td>
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
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-loss/10 text-loss hover:bg-loss/20 transition-colors text-[10px] font-bold">
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

      {closingPosition && (
        <ClosePositionDialog
          position={closingPosition}
          currentPrice={getPnL(closingPosition)?.currentPrice || null}
          onClose={() => setClosingPosition(null)}
          onConfirm={handlePositionClosed}
        />
      )}

      <div className="terminal-border rounded-lg p-3 md:p-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <PieChart className="h-4 w-4 text-primary" /> Portfolio Engine
        </h2>
        <PortfolioEngine />
      </div>

      {viewSignalId && (
        <PositionSignalDetail signalId={viewSignalId} onClose={() => setViewSignalId(null)} />
      )}
    </div>
  );
}
