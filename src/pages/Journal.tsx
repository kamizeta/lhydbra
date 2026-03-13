import { BookOpen, TrendingUp, Award, BarChart3 } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const journalEntries = [
  { id: '1', symbol: 'BTC/USD', strategy: 'Trend Following', entry: 58200, exit: 64500, stopLoss: 55000, size: 0.3, result: 1890, pct: 10.82, date: '2024-03-01', analysis: 'Strong uptrend confirmation. Held through pullback. Good discipline.' },
  { id: '2', symbol: 'NVDA', strategy: 'Momentum', entry: 780, exit: 845, stopLoss: 740, size: 10, result: 650, pct: 8.33, date: '2024-03-04', analysis: 'AI sector momentum. Entry on breakout was ideal. Slightly early exit.' },
  { id: '3', symbol: 'TSLA', strategy: 'Mean Reversion', entry: 265, exit: 248, stopLoss: 275, size: 15, result: -255, pct: -6.42, date: '2024-03-06', analysis: 'Tried to catch reversal too early. Fundamental weakness continued. Lesson: wait for confirmation.' },
  { id: '4', symbol: 'SPY', strategy: 'Dollar Cost Avg', entry: 502, exit: 518, stopLoss: 490, size: 20, result: 320, pct: 3.19, date: '2024-03-08', analysis: 'Regular DCA buy. Market dip provided good entry. Systematic approach working.' },
  { id: '5', symbol: 'XAU/USD', strategy: 'Defensive', entry: 2280, exit: 2340, stopLoss: 2250, size: 3, result: 180, pct: 2.63, date: '2024-03-10', analysis: 'Geopolitical hedge. Performed as expected. Gold thesis intact.' },
  { id: '6', symbol: 'SOL/USD', strategy: 'Breakout', entry: 135, exit: 172, stopLoss: 120, size: 30, result: 1110, pct: 27.41, date: '2024-03-12', analysis: 'Massive breakout from consolidation. Volume confirmed. Best trade this month.' },
];

export default function Journal() {
  const { t } = useI18n();
  const totalTrades = journalEntries.length;
  const winners = journalEntries.filter(e => e.result > 0);
  const losers = journalEntries.filter(e => e.result < 0);
  const winRate = (winners.length / totalTrades) * 100;
  const totalPnl = journalEntries.reduce((s, e) => s + e.result, 0);
  const avgWin = winners.reduce((s, e) => s + e.result, 0) / winners.length;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, e) => s + e.result, 0) / losers.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winners.length) / (avgLoss * losers.length) : Infinity;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.journal.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.journal.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t.journal.winRate} value={`${formatNumber(winRate)}%`} change={`${winners.length}W / ${losers.length}L`} changeType="positive" icon={Award} />
        <MetricCard label={t.journal.totalPnl} value={`+${formatCurrency(totalPnl)}`} change={`${totalTrades} ${t.common.trades}`} changeType="positive" icon={TrendingUp} />
        <MetricCard label={t.journal.profitFactor} value={formatNumber(profitFactor)} icon={BarChart3} />
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
              {journalEntries.map(entry => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{entry.date}</td>
                  <td className="p-3 font-mono font-medium text-foreground">{entry.symbol}</td>
                  <td className="p-3"><StatusBadge variant="info">{entry.strategy}</StatusBadge></td>
                  <td className="text-right p-3 font-mono text-foreground">{formatCurrency(entry.entry)}</td>
                  <td className="text-right p-3 font-mono text-foreground">{formatCurrency(entry.exit)}</td>
                  <td className="text-right p-3 font-mono text-loss">{formatCurrency(entry.stopLoss)}</td>
                  <td className="text-right p-3">
                    <div className={cn("font-mono font-medium", entry.result >= 0 ? "text-profit" : "text-loss")}>
                      {entry.result >= 0 ? '+' : ''}{formatCurrency(entry.result)}
                    </div>
                    <div className={cn("text-xs font-mono", entry.pct >= 0 ? "text-profit" : "text-loss")}>
                      {entry.pct >= 0 ? '+' : ''}{formatNumber(entry.pct)}%
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[250px] truncate">{entry.analysis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance by Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3">{t.journal.pnlByStrategy}</h2>
          {['Trend Following', 'Momentum', 'Breakout', 'Defensive', 'Dollar Cost Avg', 'Mean Reversion'].map(strategy => {
            const trades = journalEntries.filter(e => e.strategy === strategy);
            const pnl = trades.reduce((s, t) => s + t.result, 0);
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
          {[...new Set(journalEntries.map(e => e.symbol))].map(symbol => {
            const trades = journalEntries.filter(e => e.symbol === symbol);
            const pnl = trades.reduce((s, t) => s + t.result, 0);
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
    </div>
  );
}
