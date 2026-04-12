import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Loader2, BookOpen } from "lucide-react";

interface LedgerEntry {
  id: string;
  event_type: string;
  symbol: string | null;
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

function useEventLabels() {
  const { t } = useI18n();
  return {
    trade_open: t.ledger.tradeOpen,
    trade_close: t.ledger.tradeClose,
    fee: t.ledger.fee,
    adjustment: t.ledger.adjustment,
    deposit: t.ledger.deposit,
    withdrawal: t.ledger.withdrawal,
    reconciliation: t.ledger.reconciliation,
  } as Record<string, string>;
}

const EVENT_COLORS: Record<string, string> = {
  trade_open: "text-yellow-400",
  trade_close: "text-primary",
  fee: "text-red-400",
  adjustment: "text-muted-foreground",
  deposit: "text-green-400",
  withdrawal: "text-red-400",
  reconciliation: "text-blue-400",
};

export default function CapitalLedger() {
  const { user } = useAuth();
  const eventLabels = useEventLabels();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("capital_ledger")
        .select("id, event_type, symbol, amount, balance_after, notes, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setEntries((data as LedgerEntry[]) || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
          Capital Ledger
        </span>
      </div>
      {loading ? (
        <div className="px-4 py-6 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground font-mono">
          No ledger entries yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Symbol</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className={cn("px-4 py-2 whitespace-nowrap", EVENT_COLORS[e.event_type] || "text-foreground")}>
                    {EVENT_LABELS[e.event_type] || e.event_type}
                  </td>
                  <td className="px-4 py-2 text-foreground font-bold">
                    {e.symbol || "—"}
                  </td>
                  <td className={cn(
                    "px-4 py-2 text-right whitespace-nowrap",
                    e.amount >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {e.amount >= 0 ? "+" : ""}{formatCurrency(e.amount)}
                  </td>
                  <td className="px-4 py-2 text-right text-foreground whitespace-nowrap">
                    {formatCurrency(e.balance_after)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
