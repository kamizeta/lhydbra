import { useState } from "react";
import { BarChart3, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import MarketExplorer from "@/pages/MarketExplorer";
import OpportunityRadar from "@/pages/OpportunityRadar";

type TabId = 'explorer' | 'radar';

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState<TabId>('explorer');

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-6 pt-4">
        <div className="flex gap-1">
          <button onClick={() => setActiveTab('explorer')} className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap", activeTab === 'explorer' ? "bg-background text-primary border border-border border-b-transparent -mb-px" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
            <BarChart3 className="h-3.5 w-3.5" />Explorer
          </button>
          <button onClick={() => setActiveTab('radar')} className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap", activeTab === 'radar' ? "bg-background text-primary border border-border border-b-transparent -mb-px" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
            <Radar className="h-3.5 w-3.5" />Radar
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'explorer' && <MarketExplorer />}
        {activeTab === 'radar' && <OpportunityRadar />}
      </div>
    </div>
  );
}
