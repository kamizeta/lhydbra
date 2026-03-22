import { useState, useEffect, useMemo } from "react";
import {
  PieChart, TrendingUp, Shield, Briefcase, Loader2, DollarSign,
  AlertTriangle, Zap, Play, CheckCircle, XCircle, Info, BarChart3,
  Target, Layers, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────

interface Position {
  symbol: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  pnl: number | null;
  strategy_family: string | null;
}

interface AllocationItem {
  id: string;
  symbol: string;
  asset_type: string;
  direction: string;
  strategy_family: string | null;
  opportunity_score: number;
  confidence_score: number;
  expected_r_multiple: number;
  allocation_priority: number;
  correlation_penalty: number;
  adjusted_priority: number;
  score_multiplier: number;
  allocated_capital: number;
  position_size: number;
  risk_used: number;
  risk_percent: number;
  final_weight: number;
  priority_rank: number;
  status: string;
  rejection_reason: string | null;
  explanation: Record<string, unknown>;
}

interface PlanData {
  id: string;
  total_capital: number;
  allocated_capital: number;
  free_capital: number;
  status: string;
  created_at: string;
  allocations: {
    portfolio_score?: number;
    total_signals?: number;
    filtered_count?: number;
    allocated_count?: number;
    rejected_count?: number;
    remaining_risk_budget?: number;
    remaining_risk_pct?: number;
  };
  risk_budget: {
    max_total_risk_pct?: number;
    risk_per_trade_pct?: number;
    max_asset_class_pct?: number;
    max_strategy_pct?: number;
    used_risk_pct?: number;
  };
}

// ── Component ──────────────────────────────────────

export default function PortfolioAllocation() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [positions, setPositions] = useState<Position[]>([]);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [items, setItems] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [tab, setTab] = useState<"allocated" | "rejected">("allocated");

  // Load latest plan + positions
  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [posRes, planRes] = await Promise.all([
      supabase.from("positions")
        .select("symbol, asset_type, direction, quantity, avg_entry, stop_loss, pnl, strategy_family")
        .eq("user_id", user.id).eq("status", "open"),
      supabase.from("allocation_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (posRes.data) setPositions(posRes.data as Position[]);

    if (planRes.data) {
      const p = planRes.data as any;
      setPlan({
        id: p.id,
        total_capital: p.total_capital,
        allocated_capital: p.allocated_capital,
        free_capital: p.free_capital,
        status: p.status,
        created_at: p.created_at,
        allocations: p.allocations || {},
        risk_budget: p.risk_budget || {},
      });

      // Load items for this plan
      const { data: itemsData } = await supabase
        .from("allocation_items")
        .select("*")
        .eq("plan_id", p.id)
        .order("priority_rank", { ascending: true });

      if (itemsData) setItems(itemsData as unknown as AllocationItem[]);
    }

    setLoading(false);
  };

  // Run optimizer
  const runOptimizer = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("portfolio-optimizer", {
        body: {},
      });

      if (error || data?.error) {
        toast.error(`Optimizer: ${data?.error || error?.message}`);
        setRunning(false);
        return;
      }

      toast.success(`Optimización completa: ${data.allocated} asignaciones de ${data.total_signals} señales`);
      await loadData();
    } catch (err) {
      toast.error("Error al ejecutar el optimizador");
    }
    setRunning(false);
  };

  // Derived data
  const totalCapital = settings.current_capital;
  const investedCapital = positions.reduce((s, p) => s + p.quantity * p.avg_entry, 0);
  const freeCapital = totalCapital - investedCapital;

  const totalRiskDollars = positions.reduce((s, p) => {
    if (!p.stop_loss) return s;
    return s + Math.abs(p.avg_entry - p.stop_loss) * p.quantity;
  }, 0);
  const riskBudgetUsed = totalCapital > 0 ? (totalRiskDollars / totalCapital) * 100 : 0;

  const allocatedItems = items.filter(i => i.status === "allocated");
  const rejectedItems = items.filter(i => i.status === "rejected");

  const portfolioScore = (plan?.allocations?.portfolio_score as number) || 0;

  // Exposure by type
  const exposureByType = useMemo(() => {
    const map: Record<string, number> = {};
    positions.forEach(p => {
      map[p.asset_type] = (map[p.asset_type] || 0) + p.quantity * p.avg_entry;
    });
    allocatedItems.forEach(a => {
      map[a.asset_type] = (map[a.asset_type] || 0) + a.allocated_capital;
    });
    return map;
  }, [positions, allocatedItems]);

  // Exposure by strategy
  const exposureByStrategy = useMemo(() => {
    const map: Record<string, number> = {};
    positions.forEach(p => {
      const f = p.strategy_family || "unclassified";
      map[f] = (map[f] || 0) + p.quantity * p.avg_entry;
    });
    allocatedItems.forEach(a => {
      const f = a.strategy_family || "unclassified";
      map[f] = (map[f] || 0) + a.allocated_capital;
    });
    return map;
  }, [positions, allocatedItems]);

  const typeColors: Record<string, string> = {
    crypto: "bg-chart-1", stock: "bg-chart-2", etf: "bg-chart-3",
    forex: "bg-chart-4", commodity: "bg-chart-5",
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <PieChart className="h-5 w-5 md:h-6 md:w-6 text-primary" /> Portfolio Optimizer
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground font-mono">
            Risk-aware • Correlation-adjusted • Score-driven allocation
          </p>
        </div>
        <button
          onClick={runOptimizer}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Optimizing..." : "Run Optimizer"}
        </button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <MetricCard label="Total Capital" value={formatCurrency(totalCapital)} icon={DollarSign} />
        <MetricCard label="Invested" value={formatCurrency(investedCapital)} icon={Briefcase} />
        <MetricCard label="Free Capital" value={formatCurrency(freeCapital)} changeType={freeCapital > 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard
          label="Risk Used"
          value={`${formatNumber(riskBudgetUsed)}%`}
          change={`of ${settings.max_daily_risk}%`}
          changeType={riskBudgetUsed < settings.max_daily_risk ? "positive" : "negative"}
          icon={Shield}
        />
        <MetricCard
          label="Portfolio Score"
          value={portfolioScore > 0 ? portfolioScore.toFixed(1) : "—"}
          changeType={portfolioScore >= 70 ? "positive" : portfolioScore >= 50 ? "neutral" : "negative"}
          icon={Target}
        />
      </div>

      {/* Plan summary banner */}
      {plan && (
        <div className="terminal-border rounded-lg p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs font-mono text-muted-foreground">Last optimization:</span>
              <span className="text-xs font-mono text-foreground">
                {new Date(plan.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground">Signals: <span className="text-foreground font-bold">{plan.allocations.total_signals || 0}</span></span>
              <span className="text-muted-foreground">Filtered: <span className="text-foreground font-bold">{plan.allocations.filtered_count || 0}</span></span>
              <span className="text-profit">Allocated: <span className="font-bold">{plan.allocations.allocated_count || 0}</span></span>
              <span className="text-loss">Rejected: <span className="font-bold">{plan.allocations.rejected_count || 0}</span></span>
            </div>
          </div>
          <button onClick={loadData} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Left: Exposure panels */}
        <div className="lg:col-span-1 space-y-4">
          {/* By Asset Type */}
          <div className="terminal-border rounded-lg p-3 md:p-4">
            <h2 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-primary" /> Exposure by Asset
            </h2>
            {Object.keys(exposureByType).length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">No exposure</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(exposureByType).sort((a, b) => b[1] - a[1]).map(([type, val]) => {
                  const pct = totalCapital > 0 ? (val / totalCapital) * 100 : 0;
                  const overLimit = pct > settings.max_single_asset;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-foreground font-bold capitalize">{type}</span>
                        <span className={cn("font-bold", overLimit ? "text-loss" : "text-foreground")}>{formatNumber(pct)}%</span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", overLimit ? "bg-loss" : typeColors[type] || "bg-primary")}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By Strategy */}
          <div className="terminal-border rounded-lg p-3 md:p-4">
            <h2 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> Exposure by Strategy
            </h2>
            {Object.keys(exposureByStrategy).length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">No exposure</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(exposureByStrategy).sort((a, b) => b[1] - a[1]).map(([fam, val]) => {
                  const pct = totalCapital > 0 ? (val / totalCapital) * 100 : 0;
                  return (
                    <div key={fam} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-foreground font-bold capitalize">{fam.replace(/_/g, " ")}</span>
                        <span className="font-bold">{formatNumber(pct)}%</span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Risk Budget */}
          {plan?.risk_budget && (
            <div className="terminal-border rounded-lg p-3 md:p-4">
              <h2 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary" /> Risk Budget
              </h2>
              <div className="space-y-2 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk/Trade</span>
                  <span className="text-foreground">{plan.risk_budget.risk_per_trade_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Total Risk</span>
                  <span className="text-foreground">{plan.risk_budget.max_total_risk_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used</span>
                  <span className={cn(
                    (plan.risk_budget.used_risk_pct || 0) > (plan.risk_budget.max_total_risk_pct || 5) ? "text-loss" : "text-profit"
                  )}>{plan.risk_budget.used_risk_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-foreground">{formatCurrency(plan.free_capital)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Allocation table */}
        <div className="lg:col-span-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4">
            <button
              onClick={() => setTab("allocated")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                tab === "allocated" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <CheckCircle className="h-3 w-3" />
              Allocated ({allocatedItems.length})
            </button>
            <button
              onClick={() => setTab("rejected")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                tab === "rejected" ? "bg-loss/10 text-loss" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <XCircle className="h-3 w-3" />
              Rejected ({rejectedItems.length})
            </button>
          </div>

          {/* Table */}
          {items.length === 0 ? (
            <div className="terminal-border rounded-lg p-8 text-center">
              <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No optimization results yet</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                Create signals in the Signal Engine, then run the optimizer
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(tab === "allocated" ? allocatedItems : rejectedItems).map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "terminal-border rounded-lg transition-colors",
                    item.status === "allocated" ? "hover:border-primary/30" : "hover:border-loss/30"
                  )}
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    className="w-full px-3 md:px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">#{item.priority_rank}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground font-mono">{item.symbol}</span>
                          <StatusBadge variant={item.direction === "long" ? "profit" : "loss"}>
                            {item.direction.toUpperCase()}
                          </StatusBadge>
                          {item.status === "rejected" && (
                            <StatusBadge variant="loss">REJECTED</StatusBadge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono capitalize truncate">
                          {item.strategy_family || "—"} · {item.asset_type}
                        </div>
                      </div>
                    </div>

                    {item.status === "allocated" ? (
                      <div className="flex items-center gap-4 md:gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] text-muted-foreground font-mono">Capital</div>
                          <div className="text-xs font-mono font-bold text-foreground">{formatCurrency(item.allocated_capital)}</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-muted-foreground font-mono">Position</div>
                          <div className="text-xs font-mono font-bold text-foreground">{item.position_size.toFixed(4)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground font-mono">Risk</div>
                          <div className="text-xs font-mono font-bold text-foreground">{item.risk_percent.toFixed(2)}%</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground font-mono">Priority</div>
                          <div className={cn(
                            "text-xs font-mono font-bold",
                            item.adjusted_priority >= 50 ? "text-profit" : "text-foreground"
                          )}>
                            {item.adjusted_priority.toFixed(1)}
                          </div>
                        </div>
                        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-loss font-mono max-w-[200px] truncate">
                          {item.rejection_reason}
                        </span>
                        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    )}
                  </button>

                  {/* Expanded detail */}
                  {expandedItem === item.id && (
                    <div className="px-3 md:px-4 pb-3 border-t border-border/50 pt-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        <ExplainBox label="Opportunity Score" value={item.opportunity_score.toFixed(0)} color={item.opportunity_score >= 70 ? "text-profit" : "text-foreground"} />
                        <ExplainBox label="Confidence" value={item.confidence_score.toFixed(0)} color={item.confidence_score >= 70 ? "text-profit" : "text-foreground"} />
                        <ExplainBox label="R:R Expected" value={item.expected_r_multiple.toFixed(2)} color={item.expected_r_multiple >= 2 ? "text-profit" : "text-foreground"} />
                        <ExplainBox label="Allocation Priority" value={item.allocation_priority.toFixed(2)} />
                        <ExplainBox label="Correlation Penalty" value={`${(item.correlation_penalty * 100).toFixed(1)}%`} color={item.correlation_penalty > 0.3 ? "text-loss" : "text-muted-foreground"} />
                        <ExplainBox label="Adjusted Priority" value={item.adjusted_priority.toFixed(2)} color={item.adjusted_priority >= 50 ? "text-profit" : "text-foreground"} />
                        <ExplainBox label="Score Multiplier" value={`${item.score_multiplier}x`} color={item.score_multiplier >= 1.2 ? "text-profit" : "text-foreground"} />
                        <ExplainBox label="Portfolio Weight" value={`${(item.final_weight * 100).toFixed(2)}%`} />
                      </div>

                      {item.status === "allocated" && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">Capital: {formatCurrency(item.allocated_capital)}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">·</span>
                          <span className="text-[10px] font-mono text-muted-foreground">Size: {item.position_size.toFixed(4)} units</span>
                          <span className="text-[10px] font-mono text-muted-foreground">·</span>
                          <span className="text-[10px] font-mono text-muted-foreground">Risk: {formatCurrency(item.risk_used)} ({item.risk_percent.toFixed(2)}%)</span>
                        </div>
                      )}

                      {item.rejection_reason && (
                        <div className="mt-3 rounded-md bg-loss/10 border border-loss/20 p-2">
                          <p className="text-[10px] text-loss font-mono flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {item.rejection_reason}
                          </p>
                        </div>
                      )}

                      {/* Full explanation object */}
                      {item.explanation && Object.keys(item.explanation).length > 0 && (
                        <div className="mt-3 rounded-md bg-accent/50 p-2">
                          <p className="text-[10px] text-muted-foreground font-mono mb-1 font-bold">Decision Breakdown:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                            {Object.entries(item.explanation).map(([k, v]) => (
                              <div key={k} className="flex justify-between text-[10px] font-mono">
                                <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                                <span className="text-foreground">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────

function ExplainBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md bg-accent/50 p-2 text-center">
      <div className="text-[9px] text-muted-foreground font-mono uppercase">{label}</div>
      <div className={cn("text-sm font-mono font-bold", color || "text-foreground")}>{value}</div>
    </div>
  );
}
