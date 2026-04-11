import { useState, useEffect } from "react";
import { BookOpen, TrendingUp, Award, BarChart3, Edit3, Save, X, Tag } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JournalEntry {
  id: string;
  symbol: string;
  asset_type: string;
  direction: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entered_at: string;
  exited_at: string | null;
  pnl: number | null;
  r_multiple: number | null;
  strategy_family: string | null;
  market_regime: string | null;
  opportunity_score: number | null;
  entry_reasoning: string | null;
  exit_reasoning: string | null;
  lessons_learned: string | null;
  mistake_tags: string[] | null;
  position_id: string | null;
  signal_id: string | null;
}

const MISTAKE_OPTIONS = [
  'FOMO', 'Revenge trade', 'No stop loss', 'Moved stop', 'Early exit',
  'Late entry', 'Oversize', 'Against trend', 'No plan', 'Emotional',
];

export default function Journal() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ exit_reasoning: string; lessons_learned: string; mistake_tags: string[] }>({
    exit_reasoning: '', lessons_learned: '', mistake_tags: [],
  });

  useEffect(() => {
    if (!user) return;
    const fetchJournal = async () => {
      const { data } = await supabase
        .from('trade_journal')
        .select('*')
        .eq('user_id', user.id)
        .order('exited_at', { ascending: false });
      if (data) setEntries(data as JournalEntry[]);
    };
    fetchJournal();

    const channel = supabase
      .channel('journal-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_journal', filter: `user_id=eq.${user.id}` }, () => fetchJournal())
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
  const avgR = entries.filter(e => e.r_multiple != null).length > 0
    ? entries.filter(e => e.r_multiple != null).reduce((s, e) => s + (e.r_multiple || 0), 0) / entries.filter(e => e.r_multiple != null).length
    : 0;

  const startEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditForm({
      exit_reasoning: entry.exit_reasoning || '',
      lessons_learned: entry.lessons_learned || '',
      mistake_tags: entry.mistake_tags || [],
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from('trade_journal').update({
      exit_reasoning: editForm.exit_reasoning || null,
      lessons_learned: editForm.lessons_learned || null,
      mistake_tags: editForm.mistake_tags,
    }).eq('id', editingId);
    if (error) { toast.error('Error saving'); return; }
    toast.success('Journal entry updated');
    setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...editForm } : e));
    setEditingId(null);
  };

  const toggleMistake = (tag: string) => {
    setEditForm(prev => ({
      ...prev,
      mistake_tags: prev.mistake_tags.includes(tag)
        ? prev.mistake_tags.filter(t => t !== tag)
        : [...prev.mistake_tags, tag],
    }));
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.journal.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.journal.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label={t.journal.winRate} value={`${formatNumber(winRate)}%`} change={`${winners.length}W / ${losers.length}L`} changeType={winRate >= 50 ? "positive" : "negative"} icon={Award} />
        <MetricCard label={t.journal.totalPnl} value={`${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}`} change={`${totalTrades} ${t.common.trades}`} changeType={totalPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label={t.journal.profitFactor} value={profitFactor === Infinity ? '∞' : formatNumber(profitFactor)} icon={BarChart3} />
        <MetricCard label={t.journal.avgWinLoss} value={`${formatCurrency(avgWin)} / ${formatCurrency(avgLoss)}`} icon={BookOpen} />
        <MetricCard label="Avg R-Multiple" value={avgR !== 0 ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—'} changeType={avgR >= 0 ? "positive" : "negative"} icon={BarChart3} />
      </div>

      {/* Journal Table */}
      <div className="terminal-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-3">{t.common.date}</th>
                <th className="text-left p-3">{t.common.asset}</th>
                <th className="text-center p-3">Dir</th>
                <th className="text-left p-3">{t.common.strategy}</th>
                <th className="text-center p-3">Régimen</th>
                <th className="text-right p-3">{t.common.entry}</th>
                <th className="text-right p-3">{t.journal.exit}</th>
                <th className="text-right p-3">{t.common.result}</th>
                <th className="text-right p-3">R</th>
                <th className="text-center p-3">Score</th>
                <th className="text-left p-3">Mistakes</th>
                <th className="text-center p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted-foreground text-sm">
                    No hay operaciones en el journal aún. Al cerrar posiciones se registran automáticamente.
                  </td>
                </tr>
              ) : entries.map(entry => {
                const pnl = entry.pnl || 0;
                const isEditing = editingId === entry.id;
                return (
                  <tr key={entry.id} className={cn("border-b border-border/50 hover:bg-accent/30 transition-colors", isEditing && "bg-accent/20")}>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {entry.exited_at ? new Date(entry.exited_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3 font-mono font-medium text-foreground">{entry.symbol}</td>
                    <td className="text-center p-3">
                      <StatusBadge variant={entry.direction === 'long' ? 'profit' : 'loss'}>
                        {entry.direction.toUpperCase()}
                      </StatusBadge>
                    </td>
                    <td className="p-3"><StatusBadge variant="info">{entry.strategy_family || '-'}</StatusBadge></td>
                    <td className="text-center p-3">
                      <span className="text-[10px] font-mono text-muted-foreground">{entry.market_regime || '-'}</span>
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">{formatCurrency(entry.entry_price)}</td>
                    <td className="text-right p-3 font-mono text-foreground">{entry.exit_price ? formatCurrency(entry.exit_price) : '-'}</td>
                    <td className="text-right p-3">
                      <div className={cn("font-mono font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </div>
                    </td>
                    <td className="text-right p-3">
                      <span className={cn("font-mono text-xs font-bold", (entry.r_multiple || 0) >= 0 ? "text-profit" : "text-loss")}>
                        {entry.r_multiple != null ? `${entry.r_multiple >= 0 ? '+' : ''}${entry.r_multiple.toFixed(2)}R` : '-'}
                      </span>
                    </td>
                    <td className="text-center p-3">
                      {entry.opportunity_score != null ? (
                        <span className={cn("text-xs font-mono font-bold px-1.5 py-0.5 rounded",
                          entry.opportunity_score >= 65 ? "bg-profit/10 text-profit" :
                          entry.opportunity_score >= 45 ? "bg-primary/10 text-primary" :
                          "bg-loss/10 text-loss"
                        )}>
                          {entry.opportunity_score.toFixed(0)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {(entry.mistake_tags || []).map(tag => (
                          <span key={tag} className="text-[9px] bg-loss/10 text-loss px-1 py-0.5 rounded font-mono">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-center p-3">
                      {!isEditing ? (
                        <button onClick={() => startEdit(entry)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Editar notas">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={saveEdit} className="p-1 text-profit hover:text-profit/80"><Save className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:text-loss"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit panel */}
      {editingId && (
        <div className="terminal-border rounded-lg p-4 space-y-4 animate-slide-in">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-primary" /> Editar Notas del Trade
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Razón de salida</label>
              <textarea value={editForm.exit_reasoning} onChange={(e) => setEditForm(f => ({ ...f, exit_reasoning: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none h-20 resize-none"
                placeholder="¿Por qué cerraste esta posición?" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">Lecciones aprendidas</label>
              <textarea value={editForm.lessons_learned} onChange={(e) => setEditForm(f => ({ ...f, lessons_learned: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none h-20 resize-none"
                placeholder="¿Qué aprendiste de este trade?" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-mono uppercase flex items-center gap-1">
              <Tag className="h-3 w-3" /> Errores cometidos
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {MISTAKE_OPTIONS.map(tag => (
                <button key={tag} onClick={() => toggleMistake(tag)}
                  className={cn("px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-colors border",
                    editForm.mistake_tags.includes(tag)
                      ? "bg-loss/20 text-loss border-loss/30"
                      : "bg-accent/50 text-muted-foreground border-border hover:border-loss/30"
                  )}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveEdit} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
              <Save className="h-3.5 w-3.5" /> Guardar
            </button>
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-border text-muted-foreground rounded-md text-xs hover:bg-accent transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Strategy & Asset breakdowns */}
      {totalTrades > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">{t.journal.pnlByStrategy}</h2>
            {[...new Set(entries.map(e => e.strategy_family || 'Sin estrategia'))].map(strategy => {
              const trades = entries.filter(e => (e.strategy_family || 'Sin estrategia') === strategy);
              const pnl = trades.reduce((s, e) => s + (e.pnl || 0), 0);
              const wr = trades.length > 0 ? (trades.filter(e => (e.pnl || 0) > 0).length / trades.length * 100) : 0;
              return (
                <div key={strategy} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">{strategy}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-muted-foreground">{wr.toFixed(0)}% WR</span>
                    <span className="text-xs font-mono text-muted-foreground">{trades.length} trades</span>
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
                    <span className="text-xs font-mono text-muted-foreground">{trades.length} trades</span>
                    <span className={cn("text-sm font-mono font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">PnL por Régimen</h2>
            {[...new Set(entries.map(e => e.market_regime || 'unknown'))].map(regime => {
              const trades = entries.filter(e => (e.market_regime || 'unknown') === regime);
              const pnl = trades.reduce((s, e) => s + (e.pnl || 0), 0);
              const wr = trades.length > 0 ? (trades.filter(e => (e.pnl || 0) > 0).length / trades.length * 100) : 0;
              return (
                <div key={regime} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground capitalize">{regime}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-muted-foreground">{wr.toFixed(0)}% WR</span>
                    <span className="text-xs font-mono text-muted-foreground">{trades.length} trades</span>
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

      {/* Top mistakes */}
      {totalTrades > 0 && (() => {
        const allTags = entries.flatMap(e => e.mistake_tags || []);
        if (allTags.length === 0) return null;
        const tagCounts = allTags.reduce((acc, tag) => { acc[tag] = (acc[tag] || 0) + 1; return acc; }, {} as Record<string, number>);
        const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
        return (
          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-loss" /> Errores más frecuentes
            </h2>
            <div className="flex flex-wrap gap-3">
              {sorted.map(([tag, count]) => (
                <div key={tag} className="flex items-center gap-2 bg-loss/10 border border-loss/20 rounded-md px-3 py-1.5">
                  <span className="text-xs font-mono text-loss font-medium">{tag}</span>
                  <span className="text-[10px] font-mono text-loss/70">×{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
