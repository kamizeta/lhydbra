import { useKellyStats, KellySymbolStats } from "@/hooks/useKellyStats";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Activity, Target } from "lucide-react";

function getBarColor(kellyPct: number): string {
  if (kellyPct >= 8) return "hsl(142, 71%, 45%)";
  if (kellyPct >= 4) return "hsl(47, 100%, 50%)";
  if (kellyPct >= 1) return "hsl(25, 95%, 53%)";
  return "hsl(0, 84%, 60%)";
}

function getRiskBadge(kellyPct: number) {
  if (kellyPct >= 8) return <Badge className="bg-profit/20 text-profit border-profit/30 font-mono text-[10px]">HIGH EDGE</Badge>;
  if (kellyPct >= 4) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono text-[10px]">MODERATE</Badge>;
  if (kellyPct >= 1) return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 font-mono text-[10px]">LOW EDGE</Badge>;
  return <Badge className="bg-loss/20 text-loss border-loss/30 font-mono text-[10px]">NO EDGE</Badge>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as KellySymbolStats;
  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl p-3 shadow-2xl">
      <p className="font-mono font-bold text-foreground text-sm">{label}</p>
      <div className="mt-1.5 space-y-0.5 text-xs font-mono text-muted-foreground">
        <p>Half-Kelly: <span className="text-primary font-bold">{data.kelly_pct.toFixed(2)}%</span></p>
        <p>{t.kelly.winPct}: {(data.win_rate * 100).toFixed(1)}%</p>
        <p>{t.kelly.rRatio}: {data.r_ratio.toFixed(2)}</p>
        <p>{t.kelly.trades}: {data.total_trades}</p>
      </div>
    </div>
  );
};

export default function KellyDashboard() {
  const { data: stats, isLoading, error } = useKellyStats();

  const summaryStats = stats && stats.length > 0
    ? {
        avgKelly: stats.reduce((s, x) => s + x.kelly_pct, 0) / stats.length,
        maxKelly: Math.max(...stats.map((x) => x.kelly_pct)),
        totalTrades: stats.reduce((s, x) => s + x.total_trades, 0),
        symbols: stats.length,
      }
    : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight font-mono">
          KELLY CRITERION <span className="text-primary">DASHBOARD</span>
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Análisis cuantitativo de dimensionamiento de posiciones · Half-Kelly · Últimas 150 operaciones cerradas
        </p>
      </div>

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Target, label: "Avg Half-Kelly", value: `${summaryStats.avgKelly.toFixed(2)}%`, accent: "text-primary" },
            { icon: TrendingUp, label: "Max Half-Kelly", value: `${summaryStats.maxKelly.toFixed(2)}%`, accent: "text-profit" },
            { icon: Activity, label: "Total Trades", value: summaryStats.totalTrades.toString(), accent: "text-foreground" },
            { icon: Activity, label: "Symbols", value: summaryStats.symbols.toString(), accent: "text-foreground" },
          ].map((card) => (
            <Card key={card.label} className="bg-card/60 backdrop-blur-sm border-border/40">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center gap-2 mb-1">
                  <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">{card.label}</span>
                </div>
                <p className={`text-lg md:text-xl font-bold font-mono ${card.accent}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Chart */}
      <Card className="bg-card/60 backdrop-blur-sm border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-foreground">HALF-KELLY % POR ACTIVO</CardTitle>
          <CardDescription className="text-[10px] font-mono">
            Porcentaje óptimo de capital sugerido por el criterio de Kelly (fraccionario) basado en el historial real
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[320px] w-full rounded-lg" />
          ) : error ? (
            <div className="h-[320px] flex items-center justify-center text-loss font-mono text-sm">
              Error cargando datos
            </div>
          ) : !stats || stats.length === 0 ? (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground font-mono text-sm">
              No hay suficientes operaciones cerradas para calcular Kelly
            </div>
          ) : (
            <div className="h-[320px] md:h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="symbol"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => `${v}%`}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.15 }} />
                  <Bar dataKey="kelly_pct" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {stats.map((entry, index) => (
                      <Cell key={index} fill={getBarColor(entry.kelly_pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="bg-card/60 backdrop-blur-sm border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-foreground">DETALLE MATEMÁTICO</CardTitle>
          <CardDescription className="text-[10px] font-mono">
            formula: kelly = 0.5 × (W − (1−W) / R) · Mín 0% · Basado en trades reales
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : stats && stats.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    {["Symbol", "Trades", "Wins", "Losses", "W%", "Avg Win", "Avg Loss", "R-Ratio", "Kelly Raw", "Half-Kelly %", "Edge"].map((h) => (
                      <TableHead key={h} className="text-[10px] font-mono text-muted-foreground uppercase whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((row) => (
                    <TableRow key={row.symbol} className="border-border/30 hover:bg-accent/5">
                      <TableCell className="font-mono font-bold text-foreground text-xs">{row.symbol}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.total_trades}</TableCell>
                      <TableCell className="font-mono text-xs text-profit">{row.wins}</TableCell>
                      <TableCell className="font-mono text-xs text-loss">{row.losses}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{(row.win_rate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-mono text-xs text-profit">${row.avg_win_pnl.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-loss">${row.avg_loss_pnl.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground font-bold">{row.r_ratio.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{(row.kelly_raw * 100).toFixed(2)}%</TableCell>
                      <TableCell className="font-mono text-xs text-primary font-bold">{row.kelly_pct.toFixed(2)}%</TableCell>
                      <TableCell>{getRiskBadge(row.kelly_pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground font-mono text-sm">Sin datos</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
