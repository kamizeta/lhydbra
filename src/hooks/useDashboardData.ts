import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──
export interface DashboardPosition {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  pnl: number | null;
  opened_at: string;
}

export interface DashboardSignal {
  id: string;
  asset: string;
  direction: string;
  opportunity_score: number;
  expected_r_multiple: number;
  confidence_score: number;
}

export interface JournalStats {
  total: number;
  wins: number;
  avgR: number;
}

const POS_SELECT = "id, symbol, direction, quantity, avg_entry, stop_loss, take_profit, strategy, pnl, opened_at";

// ── Hook ──
export function useDashboardData(userId: string | undefined) {
  const qc = useQueryClient();
  const enabled = !!userId;

  // 1. Open positions
  const positionsQuery = useQuery({
    queryKey: ["dashboard", "positions", userId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select(POS_SELECT)
        .eq("user_id", userId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardPosition[];
    },
  });

  // 2. Closed PnL (sum)
  const closedPnlQuery = useQuery({
    queryKey: ["dashboard", "closedPnl", userId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("pnl")
        .eq("user_id", userId!)
        .eq("status", "closed");
      if (error) throw error;
      return (data ?? []).reduce((s, p) => s + (p.pnl || 0), 0);
    },
  });

  // 3. Journal stats
  const journalQuery = useQuery({
    queryKey: ["dashboard", "journal", userId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_journal")
        .select("pnl, r_multiple")
        .eq("user_id", userId!);
      if (error) throw error;
      const all = (data ?? []) as { pnl: number | null; r_multiple: number | null }[];
      const wins = all.filter((t) => (t.pnl || 0) > 0).length;
      const rTrades = all.filter((t) => t.r_multiple != null);
      return {
        total: all.length,
        wins,
        avgR: rTrades.length > 0 ? rTrades.reduce((s, t) => s + (t.r_multiple || 0), 0) / rTrades.length : 0,
      } satisfies JournalStats;
    },
  });

  // 4. Active signals
  const signalsQuery = useQuery({
    queryKey: ["dashboard", "signals", userId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signals")
        .select("id, asset, direction, opportunity_score, expected_r_multiple, confidence_score")
        .eq("user_id", userId!)
        .eq("status", "active")
        .order("opportunity_score", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as DashboardSignal[];
    },
  });

  // 5. Data freshness
  const freshnessQuery = useQuery({
    queryKey: ["dashboard", "freshness"],
    enabled,
    staleTime: 120_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("market_features")
        .select("symbol", { count: "exact", head: true })
        .eq("timeframe", "1d")
        .gte("computed_at", cutoff);
      if (error) throw error;
      return { fresh: (count || 0) > 0, symbol_count: count || 0 };
    },
  });

  // 6. Alpaca sync on mount — fire-and-forget, then invalidate positions
  useEffect(() => {
    if (!userId) return;
    supabase.functions.invoke("alpaca-sync", { body: { paper: true } }).then(({ error }) => {
      if (!error) {
        qc.invalidateQueries({ queryKey: ["dashboard", "positions", userId] });
      }
    });
  }, [userId, qc]);

  // 7. Realtime subscription for positions
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("dashboard-positions-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["dashboard", "positions", userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  // ── Convenience helpers ──
  const refetchSignals = () => qc.invalidateQueries({ queryKey: ["dashboard", "signals", userId] });
  const refetchPositions = () => qc.invalidateQueries({ queryKey: ["dashboard", "positions", userId] });

  return {
    positions: positionsQuery.data ?? [],
    positionsLoading: positionsQuery.isLoading,
    positionsError: positionsQuery.isError,

    closedPnl: closedPnlQuery.data ?? 0,
    closedPnlLoading: closedPnlQuery.isLoading,

    journalStats: journalQuery.data ?? { total: 0, wins: 0, avgR: 0 },
    journalLoading: journalQuery.isLoading,
    journalError: journalQuery.isError,

    activeSignals: signalsQuery.data ?? [],
    signalsLoading: signalsQuery.isLoading,

    dataFreshness: freshnessQuery.data ?? null,

    refetchSignals,
    refetchPositions,
  };
}
