import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KellySymbolStats {
  symbol: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number; // 0-1
  avg_win_pnl: number;
  avg_loss_pnl: number;
  r_ratio: number;
  kelly_raw: number;
  kelly_pct: number; // half-kelly as percentage
}

function computeKellyStats(positions: Array<{ symbol: string; pnl: number | null }>): KellySymbolStats[] {
  const grouped: Record<string, { wins: number[]; losses: number[] }> = {};

  for (const p of positions) {
    const pnl = p.pnl ?? 0;
    if (!grouped[p.symbol]) grouped[p.symbol] = { wins: [], losses: [] };
    if (pnl > 0) grouped[p.symbol].wins.push(pnl);
    else grouped[p.symbol].losses.push(pnl);
  }

  return Object.entries(grouped)
    .map(([symbol, { wins, losses }]) => {
      const total_trades = wins.length + losses.length;
      if (total_trades < 2) return null;

      const W = wins.length / total_trades;
      const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
      const R = avgLoss > 0 ? avgWin / avgLoss : 0;
      const kellyRaw = R > 0 ? W - (1 - W) / R : 0;
      const kellyHalf = kellyRaw * 0.5;

      return {
        symbol,
        total_trades,
        wins: wins.length,
        losses: losses.length,
        win_rate: W,
        avg_win_pnl: avgWin,
        avg_loss_pnl: avgLoss,
        r_ratio: R,
        kelly_raw: kellyRaw,
        kelly_pct: Math.max(kellyHalf * 100, 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.kelly_pct - a!.kelly_pct) as KellySymbolStats[];
}

export function useKellyStats() {
  return useQuery({
    queryKey: ["kelly-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("symbol, pnl")
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(150);

      if (error) throw error;
      return computeKellyStats(data || []);
    },
    staleTime: 5 * 60 * 1000,
  });
}
