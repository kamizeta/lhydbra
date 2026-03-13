import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Brain, Target, Shield, FileText, PieChart, GraduationCap, Activity, Play, Loader2, Zap } from "lucide-react";
import { mockAssets, mockPortfolio, mockAgentOutputs } from "@/lib/mockData";
import { useQuickQuotes } from "@/hooks/useMarketData";
import { useAIAgent, type AgentType } from "@/hooks/useAIAgent";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

const agents: { id: AgentType; name: string; icon: typeof Activity; description: string }[] = [
  { id: 'market-analyst', name: 'Market Analyst', icon: Activity, description: 'Analyzes trends, volatility, momentum, macro events, and liquidity.' },
  { id: 'asset-selector', name: 'Asset Selector', icon: Target, description: 'Filters and ranks assets by relative strength, volume, and trend.' },
  { id: 'strategy-engine', name: 'Strategy Engine', icon: Brain, description: 'Selects optimal strategy and capital allocation.' },
  { id: 'risk-manager', name: 'Risk Manager', icon: Shield, description: 'Evaluates position sizing, exposure, correlations, and drawdown.' },
  { id: 'order-preparator', name: 'Order Preparator', icon: FileText, description: 'Prepares entry, SL, TP, and position size for execution.' },
  { id: 'portfolio-manager', name: 'Portfolio Manager', icon: PieChart, description: 'Manages diversification, rebalancing, and sector exposure.' },
  { id: 'learning-agent', name: 'Learning Agent', icon: GraduationCap, description: 'Analyzes past trades and delivers improvement recommendations.' },
];

export default function AgentsPanel() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const { data: liveAssets } = useQuickQuotes();
  const { results, runningAgent, runAgent, runAllAgents } = useAIAgent();

  const marketData = liveAssets && liveAssets.length > 0
    ? liveAssets.map(a => ({ symbol: a.symbol, name: a.name, type: a.type, price: a.price, change: a.changePercent, rsi: a.rsi, trend: a.trend, momentum: a.momentum, rs: a.relativeStrength, volatility: a.volatility }))
    : mockAssets.map(a => ({ symbol: a.symbol, name: a.name, type: a.type, price: a.price, change: a.changePercent, rsi: a.rsi, trend: a.trend, momentum: a.momentum, rs: a.relativeStrength, volatility: a.volatility }));

  const portfolioData = mockPortfolio.map(p => ({ symbol: p.symbol, type: p.type, qty: p.quantity, entry: p.avgEntry, current: p.currentPrice, pnl: p.pnlPercent, alloc: p.allocation, strategy: p.strategy, sl: p.stopLoss, tp: p.takeProfit }));

  const handleRun = (agentId: AgentType) => {
    setSelectedAgent(agentId);
    runAgent(agentId, marketData, portfolioData);
  };

  const handleRunAll = () => {
    setSelectedAgent('market-analyst');
    runAllAgents(marketData, portfolioData);
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Agents</h1>
          <p className="text-sm text-muted-foreground font-mono">7 specialized agents • Powered by Lovable AI</p>
        </div>
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
            <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Zap className="h-4 w-4" /> Run All Agents</>
          )}
        </button>
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
                    <StatusBadge variant="profit" dot>Complete</StatusBadge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {isRunning && result?.isStreaming && (
                  <div className="mt-2">
                    <StatusBadge variant="info" dot>
                      <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Analyzing...
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
                    {agents.find(a => a.id === selectedAgent)?.name} Output
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
              <h3 className="text-sm font-medium text-muted-foreground">No Agent Output</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Select an agent and click the play button to run analysis, or click "Run All Agents" to execute the full pipeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
