import { useState, useEffect } from "react";
import { BookOpen, TrendingUp, Award, BarChart3 } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface JournalEntry {
  id: string;
  symbol: string;
  strategy: string | null;
  avg_entry: number;
  close_price: number | null;
  stop_loss: number | null;
  quantity: number;
  pnl: number | null;
  closed_at: string | null;
  notes: string | null;
  direction: string;
}

export default function Journal() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchClosed = async () => {
      const { data } = await supabase
        .from('positions')
        .select('id, symbol, strategy, avg_entry, close_price, stop_loss, quantity, pnl, closed_at, notes, direction')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });
      if (data) setEntries(data);
    };
    fetchClosed();

    const channel = supabase
      .channel('journal-positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => fetchClosed())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const totalTrades = entries.length;
  const winners = entries.filter(e => (e.pnl || 0) > 0);
  const losers = entries.filter(e => (e.pnl || 0) < 0);
  const winRate = totalTrades > 0 ? (winners.length / totalTrades) * 100 : 0;
  const totalPnl = entries.reduce((s, e) => s + (e.pnl || 0), 0);
  const avgWin = winners.length > 0 ? winners.reduce((s, e) => s + (e.pnl || 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, e) => s + (e.pnl || 0), 0) / losers.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winners.length) / (avgLoss * losers.length) : totalTrades > 0 ? Infinity : 0;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.journal.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.journal.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t.journal.winRate} value={`${formatNumber(winRate)}%`} change={`${winners.length}W / ${losers.length}L`} changeType={winRate >= 50 ? "positive" : "negative"} icon={Award} />
        <MetricCard label={t.journal.totalPnl} value={`${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}`} change={`${totalTrades} ${t.common.trades}`} changeType={totalPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label={t.journal.profitFactor} value={profitFactor === Infinity ? '∞' : formatNumber(profitFactor)} icon={BarChart3} />
        <MetricCard label={t.journal.avgWinLoss} value={`${formatCurrency(avgWin)} / ${formatCurrency(avgLoss)}`} icon={BookOpen} />
      </div>

      {/* Journal Table */}
      <div className="terminal-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-3">{t.common.date}</th>
                <th className="text-left p-3">{t.common.asset}</th>
                <th className="text-left p-3">{t.common.strategy}</th>
                <th className="text-right p-3">{t.common.entry}</th>
                <th className="text-right p-3">{t.journal.exit}</th>
                <th className="text-right p-3">SL</th>
                <th className="text-right p-3">{t.common.result}</th>
                <th className="text-left p-3">{t.common.analysis}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                    No hay operaciones cerradas aún. Cierra posiciones para que aparezcan aquí.
                  </td>
                </tr>
              ) : entries.map(entry => {
                const pnl = entry.pnl || 0;
                const pct = entry.avg_entry > 0 ? ((entry.close_price || entry.avg_entry) - entry.avg_entry) / entry.avg_entry * 100 * (entry.direction === 'short' ? -1 : 1) : 0;
                return (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {entry.closed_at ? new Date(entry.closed_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3 font-mono font-medium text-foreground">{entry.symbol}</td>
                    <td className="p-3"><StatusBadge variant="info">{entry.strategy || '-'}</StatusBadge></td>
                    <td className="text-right p-3 font-mono text-foreground">{formatCurrency(entry.avg_entry)}</td>
                    <td className="text-right p-3 font-mono text-foreground">{entry.close_price ? formatCurrency(entry.close_price) : '-'}</td>
                    <td className="text-right p-3 font-mono text-loss">{entry.stop_loss ? formatCurrency(entry.stop_loss) : '-'}</td>
                    <td className="text-right p-3">
                      <div className={cn("font-mono font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </div>
                      <div className={cn("text-xs font-mono", pct >= 0 ? "text-profit" : "text-loss")}>
                        {pct >= 0 ? '+' : ''}{formatNumber(pct)}%
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[250px] truncate">{entry.notes || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalTrades > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">{t.journal.pnlByStrategy}</h2>
            {[...new Set(entries.map(e => e.strategy || 'Sin estrategia'))].map(strategy => {
              const trades = entries.filter(e => (e.strategy || 'Sin estrategia') === strategy);
              const pnl = trades.reduce((s, e) => s + (e.pnl || 0), 0);
              return (
                <div key={strategy} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">{strategy}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{trades.length} {t.common.trades}</span>
                    <span className={cn("text-sm font-mono font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">{t.journal.pnlByAsset}</h2>
            {[...new Set(entries.map(e => e.symbol))].map(symbol => {
              const trades = entries.filter(e => e.symbol === symbol);
              const pnl = trades.reduce((s, e) => s + (e.pnl || 0), 0);
              return (
                <div key={symbol} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs font-mono text-foreground">{symbol}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{trades.length} {t.common.trades}</span>
                    <span className={cn("text-sm font-mono font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
