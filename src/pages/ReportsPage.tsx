import { useState, useEffect } from "react";
import { FileSpreadsheet, Download, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MetricCard from "@/components/shared/MetricCard";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function ReportsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadTrades = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from('positions').select('*')
      .eq('user_id', user.id).eq('status', 'closed')
      .gte('closed_at', `${dateFrom}T00:00:00Z`)
      .lte('closed_at', `${dateTo}T23:59:59Z`)
      .order('closed_at', { ascending: false });
    if (assetTypeFilter !== 'all') q = q.eq('asset_type', assetTypeFilter);
    if (resultFilter === 'win') q = q.gt('pnl', 0);
    if (resultFilter === 'loss') q = q.lt('pnl', 0);
    const { data } = await q;
    setTrades(data || []);
    setLoading(false);
  };

  useEffect(() => { loadTrades(); }, [user]);

  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const wins = trades.filter(t => Number(t.pnl || 0) > 0);
  const losses = trades.filter(t => Number(t.pnl || 0) <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length) : 1;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length || 1) : 0;

  const generateExcel = async () => {
    setGenerating(true);
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs' as any);

      const tradesSheet = trades.map(t => ({
        Date: t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '',
        Symbol: t.symbol, 'Asset Type': t.asset_type,
        Direction: t.direction, Strategy: t.strategy_family || t.strategy || '',
        Regime: t.regime_at_entry || '',
        'Entry Price': Number(t.avg_entry || 0).toFixed(4),
        'Exit Price': Number(t.close_price || 0).toFixed(4),
        Quantity: Number(t.quantity || 0),
        'PnL ($)': Number(t.pnl || 0).toFixed(2),
        Result: Number(t.pnl || 0) > 0 ? 'WIN' : 'LOSS',
        'Stop Loss': Number(t.stop_loss || 0).toFixed(4),
        Notes: t.notes || '',
      }));

      const stratMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
      for (const t of trades) {
        const s = t.strategy_family || t.strategy || 'unknown';
        if (!stratMap[s]) stratMap[s] = { wins: 0, losses: 0, pnl: 0 };
        stratMap[s].pnl += Number(t.pnl || 0);
        if (Number(t.pnl || 0) > 0) stratMap[s].wins++; else stratMap[s].losses++;
      }
      const stratSheet = Object.entries(stratMap).map(([s, d]) => ({
        Strategy: s, Trades: d.wins + d.losses, Wins: d.wins, Losses: d.losses,
        'Win Rate %': ((d.wins / (d.wins + d.losses || 1)) * 100).toFixed(1),
        'Total PnL ($)': d.pnl.toFixed(2),
      }));

      const dailyMap: Record<string, { pnl: number; trades: number; wins: number }> = {};
      for (const t of trades) {
        const day = t.closed_at?.split('T')[0] || 'unknown';
        if (!dailyMap[day]) dailyMap[day] = { pnl: 0, trades: 0, wins: 0 };
        dailyMap[day].pnl += Number(t.pnl || 0);
        dailyMap[day].trades++;
        if (Number(t.pnl || 0) > 0) dailyMap[day].wins++;
      }
      const dailySheet = Object.entries(dailyMap).sort().map(([date, d]) => ({
        Date: date, 'Daily PnL ($)': d.pnl.toFixed(2),
        Trades: d.trades, 'Win Rate %': ((d.wins / d.trades) * 100).toFixed(1),
      }));

      const summarySheet = [{
        'Date From': dateFrom, 'Date To': dateTo,
        'Total Trades': trades.length, 'Wins': wins.length, 'Losses': losses.length,
        'Win Rate %': winRate.toFixed(1), 'Total PnL ($)': totalPnl.toFixed(2),
        'Profit Factor': profitFactor.toFixed(2),
        'Avg Win ($)': avgWin.toFixed(2), 'Avg Loss ($)': avgLoss.toFixed(2),
      }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tradesSheet), 'Trades');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stratSheet), 'By Strategy');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySheet), 'Daily');
      XLSX.writeFile(wb, `LHYDBRA_${dateFrom}_${dateTo}.xlsx`);
    } catch (err) {
      toast.error('Error generating Excel');
    }
    setGenerating(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground tracking-wide">Reports</h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 terminal-border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">From</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs font-mono" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">To</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs font-mono" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">Asset Type</label>
          <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.all}</SelectItem>
              <SelectItem value="stock">{t.common.stocks}</SelectItem>
              <SelectItem value="etf">{t.common.etfs}</SelectItem>
              <SelectItem value="crypto">{t.common.crypto}</SelectItem>
              <SelectItem value="forex">{t.common.forex}</SelectItem>
              <SelectItem value="commodity">{t.common.commodities}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">{t.common.result}</label>
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.all}</SelectItem>
              <SelectItem value="win">{t.common.win}</SelectItem>
              <SelectItem value="loss">{t.common.loss}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={loadTrades} disabled={loading} className="h-8 gap-1.5">
          <Search className="h-3.5 w-3.5" />
          {loading ? "Loading..." : "Apply"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total PnL"
          value={`$${totalPnl.toFixed(2)}`}
          changeType={totalPnl >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard label="Win Rate" value={`${winRate.toFixed(1)}%`} changeType={winRate >= 50 ? 'positive' : 'negative'} />
        <MetricCard label="Profit Factor" value={profitFactor.toFixed(2)} changeType={profitFactor >= 1 ? 'positive' : 'negative'} />
        <MetricCard label="Total Trades" value={String(trades.length)} />
      </div>

      {/* Trades table */}
      <div className="terminal-border rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono">Date</TableHead>
                <TableHead className="text-[10px] font-mono">Symbol</TableHead>
                <TableHead className="text-[10px] font-mono">Direction</TableHead>
                <TableHead className="text-[10px] font-mono">Strategy</TableHead>
                <TableHead className="text-[10px] font-mono text-right">PnL ($)</TableHead>
                <TableHead className="text-[10px] font-mono">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    {loading ? "Loading trades..." : "No closed trades in this period"}
                  </TableCell>
                </TableRow>
              ) : trades.map(t => {
                const pnl = Number(t.pnl || 0);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs font-mono">{t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-xs font-mono font-medium">{t.symbol}</TableCell>
                    <TableCell className="text-xs font-mono uppercase">{t.direction}</TableCell>
                    <TableCell className="text-xs font-mono">{t.strategy_family || t.strategy || '-'}</TableCell>
                    <TableCell className={cn("text-xs font-mono text-right", pnl > 0 ? "text-profit" : "text-loss")}>
                      {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded", pnl > 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss")}>
                        {pnl > 0 ? 'WIN' : 'LOSS'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Download */}
      <Button onClick={generateExcel} disabled={trades.length === 0 || generating} className="gap-2">
        <Download className="h-4 w-4" />
        {generating ? "Generating..." : "Download Excel (.xlsx)"}
      </Button>
    </div>
  );
}
