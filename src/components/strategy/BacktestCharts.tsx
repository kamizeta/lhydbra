import { useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { cn } from "@/lib/utils";

interface Trade {
  entry_price: number;
  exit_price: number;
  pnl: number;
  r_multiple: number;
  direction: string;
  entry_reason: string;
  exit_reason: string;
}

interface Props {
  tradeLog: Trade[];
  symbol: string;
}

export default function BacktestCharts({ tradeLog, symbol }: Props) {
  const equityCurve = useMemo(() => {
    let cumPnl = 0;
    return tradeLog.map((t, i) => {
      cumPnl += t.pnl;
      return { trade: i + 1, equity: +cumPnl.toFixed(2), pnl: +t.pnl.toFixed(2) };
    });
  }, [tradeLog]);

  const rDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const t of tradeLog) {
      const r = t.r_multiple;
      const bucket = r < -2 ? "< -2R" : r < -1 ? "-2 to -1R" : r < 0 ? "-1 to 0R" : r < 1 ? "0 to 1R" : r < 2 ? "1 to 2R" : r < 3 ? "2 to 3R" : "> 3R";
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    const order = ["< -2R", "-2 to -1R", "-1 to 0R", "0 to 1R", "1 to 2R", "2 to 3R", "> 3R"];
    return order.map(label => ({ label, count: buckets[label] || 0, isPositive: !label.startsWith("-") && !label.startsWith("<") }));
  }, [tradeLog]);

  const maxDrawdown = useMemo(() => {
    let peak = 0, maxDD = 0, cum = 0;
    for (const t of tradeLog) {
      cum += t.pnl;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }, [tradeLog]);

  if (tradeLog.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Equity Curve */}
      <div className="terminal-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Equity Curve — {symbol}</h3>
          <span className={cn("text-xs font-mono font-bold", equityCurve[equityCurve.length - 1]?.equity >= 0 ? "text-profit" : "text-loss")}>
            {equityCurve[equityCurve.length - 1]?.equity >= 0 ? "+" : ""}{equityCurve[equityCurve.length - 1]?.equity.toFixed(2)}
            <span className="text-muted-foreground ml-2">Max DD: -{maxDrawdown.toFixed(2)}</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={equityCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="trade" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
              labelFormatter={l => `Trade #${l}`}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* R-Multiple Distribution */}
      <div className="terminal-border rounded-lg p-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">R-Multiple Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              formatter={(value: number) => [`${value} trades`, "Count"]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {rDistribution.map((entry, idx) => (
                <Cell key={idx} fill={entry.isPositive ? "hsl(var(--profit))" : "hsl(var(--loss))"} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
