import { useState, useEffect } from 'react';
import { Trash2, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/StatusBadge';

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
}

export default function PositionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: '', name: '', asset_type: 'stock', direction: 'long',
    quantity: 0, avg_entry: 0, stop_loss: 0, take_profit: 0, strategy: '',
  });

  useEffect(() => {
    if (user) loadPositions();
  }, [user]);

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
      user_id: user!.id,
      symbol: form.symbol.toUpperCase(),
      name: form.name,
      asset_type: form.asset_type,
      direction: form.direction,
      quantity: form.quantity,
      avg_entry: form.avg_entry,
      stop_loss: form.stop_loss || null,
      take_profit: form.take_profit || null,
      strategy: form.strategy || null,
    });
    if (error) {
      toast.error('Error adding position');
    } else {
      toast.success('Position added');
      setShowForm(false);
      setForm({ symbol: '', name: '', asset_type: 'stock', direction: 'long', quantity: 0, avg_entry: 0, stop_loss: 0, take_profit: 0, strategy: '' });
      loadPositions();
    }
  };

  const deletePosition = async (id: string) => {
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (error) {
      toast.error('Error deleting position');
    } else {
      toast.success('Position deleted');
      setPositions(prev => prev.filter(p => p.id !== id));
    }
  };

  const closePosition = async (id: string) => {
    const { error } = await supabase.from('positions').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) {
      toast.error('Error closing position');
    } else {
      toast.success('Position closed');
      setPositions(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.dashboard.openPositions}</h1>
          <p className="text-sm text-muted-foreground font-mono">{positions.length} {t.common.active}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'New Position'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={addPosition} className="terminal-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Symbol</label>
              <input type="text" value={form.symbol} onChange={(e) => setForm(f => ({ ...f, symbol: e.target.value }))} required
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Type</label>
              <select value={form.asset_type} onChange={(e) => setForm(f => ({ ...f, asset_type: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="stock">{t.common.stocks}</option>
                <option value="crypto">{t.common.crypto}</option>
                <option value="etf">{t.common.etfs}</option>
                <option value="commodity">{t.common.commodities}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Direction</label>
              <select value={form.direction} onChange={(e) => setForm(f => ({ ...f, direction: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                <option value="long">LONG</option>
                <option value="short">SHORT</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Quantity</label>
              <input type="number" step="any" value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} required
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{t.common.entry}</label>
              <input type="number" step="any" value={form.avg_entry} onChange={(e) => setForm(f => ({ ...f, avg_entry: Number(e.target.value) }))} required
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{t.common.stopLoss}</label>
              <input type="number" step="any" value={form.stop_loss} onChange={(e) => setForm(f => ({ ...f, stop_loss: Number(e.target.value) }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{t.common.takeProfit}</label>
              <input type="number" step="any" value={form.take_profit} onChange={(e) => setForm(f => ({ ...f, take_profit: Number(e.target.value) }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{t.common.strategy}</label>
              <input type="text" value={form.strategy} onChange={(e) => setForm(f => ({ ...f, strategy: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-colors">
              Add
            </button>
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
              <th className="text-right p-3">SL</th>
              <th className="text-right p-3">TP</th>
              <th className="text-right p-3">{t.common.strategy}</th>
              <th className="text-center p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-xs font-mono">No open positions</td></tr>
            ) : positions.map((pos) => (
              <tr key={pos.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="p-3">
                  <div className="font-mono font-medium text-foreground">{pos.symbol}</div>
                  <div className="text-xs text-muted-foreground">{pos.name}</div>
                </td>
                <td className="text-center p-3">
                  <StatusBadge variant={pos.direction === 'long' ? 'profit' : 'loss'}>
                    {pos.direction === 'long' ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                    {' '}{pos.direction.toUpperCase()}
                  </StatusBadge>
                </td>
                <td className="text-right p-3 font-mono text-foreground">{pos.quantity}</td>
                <td className="text-right p-3 font-mono text-foreground">${Number(pos.avg_entry).toFixed(2)}</td>
                <td className="text-right p-3 font-mono text-loss">{pos.stop_loss ? `$${Number(pos.stop_loss).toFixed(2)}` : '—'}</td>
                <td className="text-right p-3 font-mono text-profit">{pos.take_profit ? `$${Number(pos.take_profit).toFixed(2)}` : '—'}</td>
                <td className="text-right p-3"><StatusBadge variant="info">{pos.strategy || '—'}</StatusBadge></td>
                <td className="text-center p-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => closePosition(pos.id)} className="p-1 text-muted-foreground hover:text-warning transition-colors" title="Close">
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deletePosition(pos.id)} className="p-1 text-muted-foreground hover:text-loss transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
