import { Bot, Brain, Target, Shield, FileText, PieChart, GraduationCap, Activity } from "lucide-react";
import { mockAgentOutputs } from "@/lib/mockData";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

const agents = [
  { id: 'market-analyst', name: 'Market Analyst', icon: Activity, description: 'Analyzes trends, volatility, momentum, macro events, and liquidity.', status: 'active' as const, lastRun: '2 min ago' },
  { id: 'asset-selector', name: 'Asset Selector', icon: Target, description: 'Filters and ranks assets by relative strength, volume, and trend.', status: 'active' as const, lastRun: '5 min ago' },
  { id: 'strategy-engine', name: 'Strategy Engine', icon: Brain, description: 'Selects optimal strategy and capital allocation.', status: 'active' as const, lastRun: '10 min ago' },
  { id: 'risk-manager', name: 'Risk Manager', icon: Shield, description: 'Evaluates position sizing, exposure, correlations, and drawdown.', status: 'active' as const, lastRun: '1 min ago' },
  { id: 'order-prep', name: 'Order Preparator', icon: FileText, description: 'Prepares entry, SL, TP, and position size for execution.', status: 'idle' as const, lastRun: '15 min ago' },
  { id: 'portfolio-mgr', name: 'Portfolio Manager', icon: PieChart, description: 'Manages diversification, rebalancing, and sector exposure.', status: 'active' as const, lastRun: '30 min ago' },
  { id: 'learning', name: 'Learning Agent', icon: GraduationCap, description: 'Analyzes past trades and delivers improvement recommendations.', status: 'idle' as const, lastRun: '1 hour ago' },
];

export default function AgentsPanel() {
  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Agents</h1>
        <p className="text-sm text-muted-foreground font-mono">7 specialized agents • Visible & auditable</p>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map(agent => {
          const outputs = mockAgentOutputs.filter(o => o.agent === agent.name);
          return (
            <div key={agent.id} className="terminal-border rounded-lg p-4 hover:glow-primary transition-shadow">
              <div className="flex items-start justify-between">
                <div className="rounded-md bg-primary/10 p-2">
                  <agent.icon className="h-5 w-5 text-primary" />
                </div>
                <StatusBadge variant={agent.status === 'active' ? 'profit' : 'neutral'} dot>
                  {agent.status}
                </StatusBadge>
              </div>
              <h3 className="mt-3 font-bold text-foreground text-sm">{agent.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{agent.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">Last: {agent.lastRun}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{outputs.length} outputs</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent Output Log */}
      <div className="terminal-border rounded-lg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Agent Output Log
          </h2>
          <span className="text-xs font-mono text-muted-foreground">All outputs • Chronological</span>
        </div>
        <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
          {mockAgentOutputs.map(output => (
            <div key={output.id} className="p-4 hover:bg-accent/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-1 h-2 w-2 rounded-full shrink-0",
                  output.severity === 'critical' ? "bg-loss" :
                  output.severity === 'warning' ? "bg-warning" : "bg-primary"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge variant="info">{output.agent}</StatusBadge>
                    <span className="text-sm font-medium text-foreground">{output.title}</span>
                    <StatusBadge variant={
                      output.type === 'alert' ? 'warning' :
                      output.type === 'risk' ? 'loss' :
                      output.type === 'signal' ? 'profit' : 'neutral'
                    }>
                      {output.type}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{output.content}</p>
                  <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                    {new Date(output.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
