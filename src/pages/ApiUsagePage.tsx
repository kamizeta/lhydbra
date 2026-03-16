import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Clock, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface UsageRow {
  source: string;
  action: string;
  symbols_requested: number;
  symbols_returned: number;
  response_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface SourceStats {
  source: string;
  totalCalls: number;
  totalRequested: number;
  totalReturned: number;
  avgResponseMs: number;
  successRate: number;
  errorCount: number;
  lastCall: string;
}

const SOURCE_COLORS: Record<string, string> = {
  freecryptoapi: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "fcsapi-forex": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "fcsapi-stock": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  twelvedata: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  finnhub: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "yahoo-batch": "bg-red-500/20 text-red-400 border-red-500/30",
  "yahoo-chart": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "db-cache": "bg-muted text-muted-foreground border-border",
};

const SOURCE_LABELS: Record<string, string> = {
  freecryptoapi: "FreeCrypto API",
  "fcsapi-forex": "FCS API (Forex)",
  "fcsapi-stock": "FCS API (Stocks)",
  twelvedata: "Twelve Data",
  finnhub: "Finnhub",
  "yahoo-batch": "Yahoo Batch",
  "yahoo-chart": "Yahoo Chart",
  "db-cache": "DB Cache",
};

const SOURCE_LIMITS: Record<string, string> = {
  freecryptoapi: "Ilimitado (key-based)",
  "fcsapi-forex": "~500 calls/hr (free)",
  "fcsapi-stock": "~500 calls/hr (free)",
  twelvedata: "8 credits/min (free)",
  finnhub: "60 calls/min (free)",
  "yahoo-batch": "Sin límite oficial (rate-limited)",
  "yahoo-chart": "Sin límite oficial (rate-limited)",
  "db-cache": "Sin límite",
};

export default function ApiUsagePage() {
  const { data: usageLogs, isLoading, refetch } = useQuery({
    queryKey: ["api-usage-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_usage_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as UsageRow[];
    },
    staleTime: 30_000,
  });

  const stats: SourceStats[] = (() => {
    if (!usageLogs?.length) return [];
    const map = new Map<string, UsageRow[]>();
    for (const row of usageLogs) {
      const arr = map.get(row.source) || [];
      arr.push(row);
      map.set(row.source, arr);
    }

    return Array.from(map.entries())
      .map(([source, rows]) => {
        const totalCalls = rows.length;
        const totalRequested = rows.reduce((s, r) => s + r.symbols_requested, 0);
        const totalReturned = rows.reduce((s, r) => s + r.symbols_returned, 0);
        const withTime = rows.filter((r) => r.response_time_ms != null);
        const avgResponseMs = withTime.length
          ? Math.round(withTime.reduce((s, r) => s + (r.response_time_ms || 0), 0) / withTime.length)
          : 0;
        const errorCount = rows.filter((r) => r.error_message).length;
        const successRate = totalCalls > 0 ? Math.round(((totalCalls - errorCount) / totalCalls) * 100) : 0;
        const lastCall = rows[0]?.created_at || "";

        return { source, totalCalls, totalRequested, totalReturned, avgResponseMs, successRate, errorCount, lastCall };
      })
      .sort((a, b) => b.totalCalls - a.totalCalls);
  })();

  const totalCalls = stats.reduce((s, r) => s + r.totalCalls, 0);
  const totalReturned = stats.reduce((s, r) => s + r.totalReturned, 0);

  // Last 20 logs for activity feed
  const recentLogs = usageLogs?.slice(0, 20) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            API Usage Monitor
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Consumo en tiempo real de las fuentes de datos de mercado
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Calls</p>
            <p className="text-2xl font-bold text-foreground">{totalCalls.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Symbols Returned</p>
            <p className="text-2xl font-bold text-foreground">{totalReturned.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Sources</p>
            <p className="text-2xl font-bold text-foreground">{stats.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Response</p>
            <p className="text-2xl font-bold text-foreground">
              {stats.length ? Math.round(stats.reduce((s, r) => s + r.avgResponseMs, 0) / stats.length) : 0}ms
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Consumo por Fuente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.map((s) => {
              const pct = totalCalls > 0 ? (s.totalCalls / totalCalls) * 100 : 0;
              const fillPct = totalReturned > 0 ? (s.totalReturned / totalReturned) * 100 : 0;
              return (
                <div key={s.source} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${SOURCE_COLORS[s.source] || ""}`}>
                        {SOURCE_LABELS[s.source] || s.source}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {SOURCE_LIMITS[s.source] || ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {s.totalCalls} calls ({pct.toFixed(1)}%)
                      </span>
                      <span className="text-foreground font-medium">
                        {s.totalReturned} symbols ({fillPct.toFixed(1)}%)
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.avgResponseMs}ms
                      </span>
                      {s.errorCount > 0 && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {s.errorCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(fillPct, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {stats.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay datos de uso aún. Los logs se generarán con la próxima actualización de mercado.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {recentLogs.map((log, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-2 rounded text-xs hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${SOURCE_COLORS[log.source] || ""}`}>
                    {SOURCE_LABELS[log.source] || log.source}
                  </Badge>
                  <span className="text-muted-foreground">
                    {log.symbols_returned}/{log.symbols_requested} symbols
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {log.response_time_ms != null && <span>{log.response_time_ms}ms</span>}
                  {log.error_message && (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-[10px]">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {recentLogs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Sin actividad reciente</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
