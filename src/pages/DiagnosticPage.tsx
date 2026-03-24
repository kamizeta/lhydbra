import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface TestResult {
  data: any;
  error: any;
  ms: number;
}

function DiagPanel({ label, result, loading, onRun }: { label: string; result: TestResult | null; loading: boolean; onRun: () => void }) {
  const hasError = result?.error || result?.data?.error;
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={onRun} disabled={loading} variant="outline" size="sm" className="font-mono text-xs w-full">
        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
        {label}
      </Button>
      {result && (
        <div className={cn("border rounded-md p-3 overflow-auto max-h-96 bg-card", hasError ? "border-destructive" : "border-profit")}>
          <p className="text-[10px] font-mono text-muted-foreground mb-1">{result.ms}ms</p>
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(result.data ?? result.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function OperatorRunPanel({ result, loading, onRun }: { result: TestResult | null; loading: boolean; onRun: () => void }) {
  const data = result?.data;
  const status = data?.status;
  const hasError = result?.error || data?.error;

  const borderClass = hasError || status === "blocked"
    ? "border-destructive"
    : status === "ready_for_approval"
    ? "border-yellow-500"
    : "border-profit";

  let summary = "";
  if (result) {
    if (hasError) summary = `🔴 Error: ${result.error || data?.error}`;
    else if (status === "executed") summary = `✅ Trades executed: ${data?.trades?.length ?? 0}`;
    else if (status === "no_opportunities") summary = "⚠️ No opportunities found";
    else if (status === "ready_for_approval") summary = "🟡 Signals ready but auto-execute is off";
    else if (status === "blocked") summary = `🔴 Blocked: ${(data?.reasons ?? []).join(", ")}`;
    else summary = `Status: ${status ?? "unknown"}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={onRun} disabled={loading} variant="outline" size="sm" className="font-mono text-xs w-full">
        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
        Run Operator (action: run)
      </Button>
      {result && (
        <div className={cn("border rounded-md p-3 overflow-auto max-h-96 bg-card", borderClass)}>
          <p className="text-[10px] font-mono text-muted-foreground mb-1">{result.ms}ms</p>
          <p className="text-xs font-mono font-semibold text-foreground mb-2">{summary}</p>
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(data ?? result.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, TestResult | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const run = async (key: string, fn: () => Promise<{ data: any; error: any }>) => {
    setLoading(p => ({ ...p, [key]: true }));
    const t0 = performance.now();
    try {
      const { data, error } = await fn();
      setResults(p => ({ ...p, [key]: { data, error, ms: Math.round(performance.now() - t0) } }));
    } catch (e: any) {
      setResults(p => ({ ...p, [key]: { data: null, error: String(e), ms: Math.round(performance.now() - t0) } }));
    }
    setLoading(p => ({ ...p, [key]: false }));
  };

  const tests = [
    { key: "market", label: "Test market-data-normalized", fn: () => supabase.functions.invoke("market-data-normalized", { body: { symbols: ["AAPL", "SPY", "BTC/USD"], timeframe: "1d" } }) },
    { key: "indicators", label: "Test compute-indicators", fn: () => supabase.functions.invoke("compute-indicators", { body: { symbols: ["AAPL", "SPY", "BTC/USD"], timeframe: "1d" } }) },
    { key: "signals", label: "Test signal-engine", fn: () => supabase.functions.invoke("signal-engine", { body: { user_id: user?.id, symbols: ["AAPL", "MSFT", "NVDA", "SPY", "QQQ", "BTC/USD"], min_score: 50, min_r: 1.0, min_confidence: 40, max_signals: 5, operator_mode: false } }) },
    { key: "operator", label: "Test operator-mode status", fn: () => supabase.functions.invoke("operator-mode", { body: { action: "status" } }) },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-mono font-bold text-foreground">DIAGNOSTIC</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tests.map(t => (
          <DiagPanel key={t.key} label={t.label} result={results[t.key] ?? null} loading={!!loading[t.key]} onRun={() => run(t.key, t.fn)} />
        ))}
      </div>
    </div>
  );
}
