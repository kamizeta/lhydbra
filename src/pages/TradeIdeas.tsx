import { useState } from "react";
import { Lightbulb, Check, X, ArrowRight, Target, Shield, TrendingUp } from "lucide-react";
import { mockTradeIdeas, TradeIdea, formatCurrency, formatNumber } from "@/lib/mockData";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function TradeIdeas() {
  const { t } = useI18n();
  const [ideas, setIdeas] = useState(mockTradeIdeas);
  const [selectedIdea, setSelectedIdea] = useState<TradeIdea | null>(null);

  const approve = (id: string) => setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' as const } : i));
  const reject = (id: string) => setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: 'rejected' as const } : i));

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.tradeIdeas.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.tradeIdeas.subtitle}</p>
      </div>

      {/* Investment Flow */}
      <div className="terminal-border rounded-lg p-4">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">{t.tradeIdeas.investmentFlow}</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {t.tradeIdeas.steps.map((step, i) => (
            <div key={step} className="flex items-center gap-1 shrink-0">
              <div className="flex items-center gap-1.5 rounded-md bg-accent/50 border border-border px-3 py-1.5">
                <span className="text-[10px] font-mono text-primary font-bold">{i + 1}</span>
                <span className="text-xs text-muted-foreground">{step}</span>
              </div>
              {i < t.tradeIdeas.steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ideas List */}
        <div className="lg:col-span-2 space-y-3">
          {ideas.map(idea => (
            <div
              key={idea.id}
              className={cn(
                "terminal-border rounded-lg p-4 cursor-pointer transition-all",
                selectedIdea?.id === idea.id && "ring-1 ring-primary glow-primary"
              )}
              onClick={() => setSelectedIdea(idea)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "rounded-md p-2",
                    idea.direction === 'long' ? "bg-profit/15" : "bg-loss/15"
                  )}>
                    <TrendingUp className={cn("h-4 w-4", idea.direction === 'long' ? "text-profit" : "text-loss rotate-180")} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground">{idea.symbol}</span>
                      <StatusBadge variant={idea.direction === 'long' ? 'profit' : 'loss'}>
                        {idea.direction.toUpperCase()}
                      </StatusBadge>
                      <StatusBadge variant={
                        idea.status === 'pending' ? 'warning' :
                        idea.status === 'approved' ? 'profit' :
                        idea.status === 'rejected' ? 'loss' : 'neutral'
                      }>
                        {idea.status.toUpperCase()}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{idea.name} • {idea.strategy}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden md:block">
                    <div className="text-xs text-muted-foreground">R/R</div>
                    <div className="font-mono font-bold text-foreground">{formatNumber(idea.riskReward)}</div>
                  </div>
                  <div className="hidden md:block">
                    <div className="text-xs text-muted-foreground">{t.common.confidence}</div>
                    <div className={cn("font-mono font-bold", idea.confidence > 75 ? "text-profit" : idea.confidence > 60 ? "text-warning" : "text-muted-foreground")}>
                      {idea.confidence}%
                    </div>
                  </div>
                  {idea.status === 'pending' && (
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); approve(idea.id); }}
                        className="rounded-md bg-profit/15 p-2 text-profit hover:bg-profit/25 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); reject(idea.id); }}
                        className="rounded-md bg-loss/15 p-2 text-loss hover:bg-loss/25 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Trade details row */}
              <div className="flex gap-4 mt-3 text-xs font-mono">
                <span className="text-muted-foreground">{t.common.entry}: <span className="text-foreground">{formatCurrency(idea.entry)}</span></span>
                <span className="text-muted-foreground">SL: <span className="text-loss">{formatCurrency(idea.stopLoss)}</span></span>
                <span className="text-muted-foreground">TP: <span className="text-profit">{formatCurrency(idea.takeProfit)}</span></span>
                <span className="text-muted-foreground">{t.common.size}: <span className="text-foreground">{idea.positionSize}</span></span>
                <span className="text-muted-foreground">{t.common.risk}: <span className="text-warning">{idea.riskPercent}%</span></span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="terminal-border rounded-lg p-4">
          {selectedIdea ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{t.tradeIdeas.tradeDetail}</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-foreground">{selectedIdea.symbol}</span>
                  <StatusBadge variant={selectedIdea.direction === 'long' ? 'profit' : 'loss'}>
                    {selectedIdea.direction.toUpperCase()}
                  </StatusBadge>
                </div>

                <div className="rounded-md bg-accent/50 p-3 space-y-2">
                  {[
                    [t.common.entry, formatCurrency(selectedIdea.entry), ''],
                    [t.common.stopLoss, formatCurrency(selectedIdea.stopLoss), 'text-loss'],
                    [t.common.takeProfit, formatCurrency(selectedIdea.takeProfit), 'text-profit'],
                    [t.tradeIdeas.rrRatio, formatNumber(selectedIdea.riskReward), ''],
                    [t.common.size, `${selectedIdea.positionSize} ${t.tradeIdeas.units}`, ''],
                    [t.common.risk, `${selectedIdea.riskPercent}%`, 'text-warning'],
                    [t.common.confidence, `${selectedIdea.confidence}%`, selectedIdea.confidence > 70 ? 'text-profit' : ''],
                    [t.common.strategy, selectedIdea.strategy, 'text-primary'],
                  ].map(([label, value, color]) => (
                    <div key={label as string} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("font-mono text-foreground", color)}>{value}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Target className="h-3 w-3" /> {t.tradeIdeas.reasoning}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selectedIdea.reasoning}</p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" /> {t.tradeIdeas.agentAnalysis}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selectedIdea.agentAnalysis}</p>
                </div>

                <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
                  <p className="text-[10px] font-mono text-primary">
                    {t.tradeIdeas.mt4Ready}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Lightbulb className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t.tradeIdeas.selectTradeIdea}</p>
              <p className="text-xs text-muted-foreground">{t.tradeIdeas.toSeeDetails}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
