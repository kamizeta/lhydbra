import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Brain, Target, Shield, FileText, PieChart, GraduationCap, Activity, Play, Loader2, Zap } from "lucide-react";
import { mockAssets } from "@/lib/mockData";
import { useQuickQuotes } from "@/hooks/useMarketData";
import { useAgentStore, type AgentType } from "@/hooks/useAgentStore";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StatusBadge from "@/components/shared/StatusBadge";
import AgentsHelpButton from "@/components/AgentsHelpButton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

export default function AgentsPanel() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const { data: liveAssets } = useQuickQuotes();
  const { results, runningAgent, runAgent, runAllAgents, setLanguage } = useAgentStore();
  const { settings } = useUserSettings();

  // Sync language to global store
  useEffect(() => { setLanguage(language); }, [language, setLanguage]);

  // Auto-select running agent when returning to page
  useEffect(() => {
    if (runningAgent && !selectedAgent) {
      setSelectedAgent(runningAgent);
    }
  }, [runningAgent, selectedAgent]);

  // Fetch real positions from DB
  const [positions, setPositions] = useState<any[]>([]);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [marketFeatures, setMarketFeatures] = useState<any[]>([]);
  const [opportunityScores, setOpportunityScores] = useState<any[]>([]);
  const [strategyPerformance, setStrategyPerformance] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open')
      .then(({ data }) => { if (data) setPositions(data); });
    // Fetch trade_journal (richer data than raw closed positions)
    supabase.from('trade_journal').select('*').eq('user_id', user.id).order('exited_at', { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setClosedTrades(data); });
    supabase.from('market_features').select('*').eq('timeframe', '1d')
      .then(({ data }) => { if (data) setMarketFeatures(data); });
    supabase.from('opportunity_scores').select('*').eq('timeframe', '1d').order('total_score', { ascending: false })
      .then(({ data }) => { if (data) setOpportunityScores(data); });
    supabase.from('strategy_performance').select('*').eq('user_id', user.id)
      .then(({ data }) => { if (data) setStrategyPerformance(data); });
  }, [user]);

  const agents: { id: AgentType; name: string; icon: typeof Activity; description: string }[] = [
    { id: 'market-analyst', name: t.agents.marketAnalyst, icon: Activity, description: t.agents.marketAnalystDesc },
    { id: 'asset-selector', name: t.agents.assetSelector, icon: Target, description: t.agents.assetSelectorDesc },
    { id: 'strategy-engine', name: t.agents.strategyEngine, icon: Brain, description: t.agents.strategyEngineDesc },
    { id: 'risk-manager', name: t.agents.riskManager, icon: Shield, description: t.agents.riskManagerDesc },
    { id: 'order-preparator', name: t.agents.orderPreparator, icon: FileText, description: t.agents.orderPreparatorDesc },
    { id: 'portfolio-manager', name: t.agents.portfolioManager, icon: PieChart, description: t.agents.portfolioManagerDesc },
    { id: 'learning-agent', name: t.agents.learningAgent, icon: GraduationCap, description: t.agents.learningAgentDesc },
  ];

  const marketData = liveAssets && liveAssets.length > 0
    ? liveAssets.map(a => ({ symbol: a.symbol, name: a.name, type: a.type, price: a.price, change: a.changePercent, rsi: a.rsi, trend: a.trend, momentum: a.momentum, rs: a.relativeStrength, volatility: a.volatility }))
    : mockAssets.map(a => ({ symbol: a.symbol, name: a.name, type: a.type, price: a.price, change: a.changePercent, rsi: a.rsi, trend: a.trend, momentum: a.momentum, rs: a.relativeStrength, volatility: a.volatility }));

  const portfolioData = positions.map(p => ({ symbol: p.symbol, type: p.asset_type, qty: p.quantity, entry: p.avg_entry, direction: p.direction, strategy: p.strategy, sl: p.stop_loss, tp: p.take_profit }));
  const tradeHistory = closedTrades.map(t => ({ symbol: t.symbol, direction: t.direction, entry: t.avg_entry, exit: t.close_price, pnl: t.pnl, strategy: t.strategy, opened: t.opened_at, closed: t.closed_at }));

  const userConfig = {
    initial_capital: settings.initial_capital,
    current_capital: settings.current_capital,
    risk_per_trade: settings.risk_per_trade,
    max_daily_risk: settings.max_daily_risk,
    max_weekly_risk: settings.max_weekly_risk,
    max_drawdown: settings.max_drawdown,
    max_positions: settings.max_positions,
    max_leverage: settings.max_leverage,
    max_single_asset: settings.max_single_asset,
    max_correlation: settings.max_correlation,
    stop_loss_required: settings.stop_loss_required,
    min_rr_ratio: settings.min_rr_ratio,
  };

  const autoRefresh = useAutoRefresh();
  const prevAutoRefreshState = useRef<boolean | null>(null);

  const enableAutoRefreshForAgents = () => {
    prevAutoRefreshState.current = autoRefresh.enabled;
    if (!autoRefresh.enabled) {
      autoRefresh.setEnabled(true);
    }
  };

  useEffect(() => {
    if (!runningAgent && prevAutoRefreshState.current !== null) {
      autoRefresh.setEnabled(prevAutoRefreshState.current);
      prevAutoRefreshState.current = null;
    }
  }, [runningAgent]);

  // Convert market features array to keyed object for easier agent consumption
  const marketFeaturesMap = marketFeatures.reduce((acc: any, f: any) => {
    acc[f.symbol] = f;
    return acc;
  }, {});

  const handleRun = (agentId: AgentType) => {
    setSelectedAgent(agentId);
    enableAutoRefreshForAgents();
    runAgent(agentId, { marketData, userConfig }, portfolioData, tradeHistory, marketFeaturesMap, opportunityScores, strategyPerformance);
  };

  const handleRunAll = () => {
    setSelectedAgent('market-analyst');
    enableAutoRefreshForAgents();
    runAllAgents({ marketData, userConfig }, portfolioData, tradeHistory, marketFeaturesMap, opportunityScores, strategyPerformance);
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.agents.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">{t.agents.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <AgentsHelpButton />
        <button
          onClick={handleRunAll}
          disabled={!!runningAgent}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            runningAgent
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
          )}
        >
          {runningAgent ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t.common.running}</>
          ) : (
            <><Zap className="h-4 w-4" /> {t.agents.runAllAgents}</>
          )}
        </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Cards */}
        <div className="space-y-3">
          {agents.map(agent => {
            const result = results[agent.id];
            const isRunning = runningAgent === agent.id;
            const hasResult = result && result.content && !result.content.startsWith('Error');

            return (
              <div
                key={agent.id}
                className={cn(
                  "terminal-border rounded-lg p-4 cursor-pointer transition-all",
                  selectedAgent === agent.id && "ring-1 ring-primary glow-primary",
                  isRunning && "border-primary/50"
                )}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "rounded-md p-2",
                      isRunning ? "bg-primary/20" : hasResult ? "bg-profit/15" : "bg-primary/10"
                    )}>
                      {isRunning ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      ) : (
                        <agent.icon className={cn("h-4 w-4", hasResult ? "text-profit" : "text-primary")} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{agent.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{agent.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRun(agent.id); }}
                    disabled={!!runningAgent}
                    className={cn(
                      "rounded-md p-1.5 transition-colors",
                      runningAgent
                        ? "text-muted-foreground cursor-not-allowed"
                        : "text-primary hover:bg-primary/15"
                    )}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                </div>
                {hasResult && (
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge variant="profit" dot>{t.common.complete}</StatusBadge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {isRunning && result?.isStreaming && (
                  <div className="mt-2">
                    <StatusBadge variant="info" dot>
                      <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />{t.common.analyzing}
                    </StatusBadge>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Agent Output */}
        <div className="lg:col-span-2 terminal-border rounded-lg overflow-hidden">
          {selectedAgent && results[selectedAgent]?.content ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">
                    {agents.find(a => a.id === selectedAgent)?.name} — {t.agents.output}
                  </h2>
                  {results[selectedAgent]?.isStreaming && (
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {results[selectedAgent]?.timestamp && new Date(results[selectedAgent].timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 max-h-[calc(100vh-280px)]">
                <div className="prose prose-sm prose-invert max-w-none
                  prose-headings:text-foreground prose-headings:font-bold
                  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                  prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-sm
                  prose-strong:text-foreground
                  prose-li:text-muted-foreground prose-li:text-sm
                  prose-code:text-primary prose-code:bg-primary/10 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono
                  prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md
                  prose-table:text-sm
                  prose-th:text-foreground prose-th:font-bold prose-th:border-border prose-th:border prose-th:px-3 prose-th:py-1.5 prose-th:bg-muted
                  prose-td:text-muted-foreground prose-td:border-border prose-td:border prose-td:px-3 prose-td:py-1.5
                  prose-hr:border-border
                ">
                  <ReactMarkdown>{results[selectedAgent].content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-center">
              <Bot className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground">{t.agents.noOutput}</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {t.agents.noOutputDesc}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
