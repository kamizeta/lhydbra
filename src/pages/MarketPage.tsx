import { useState } from "react";
import { BarChart3, Radar, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import MarketExplorer from "@/pages/MarketExplorer";
import OpportunityRadar from "@/pages/OpportunityRadar";
import ApiUsagePage from "@/pages/ApiUsagePage";

type TabId = 'explorer' | 'radar' | 'api-usage';

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState<TabId>('explorer');

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'explorer', label: 'Explorer', icon: BarChart3 },
    { id: 'radar', label: 'Radar', icon: Radar },
    { id: 'api-usage', label: 'API Usage', icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-3 md:px-6 pt-2 md:pt-4">
        <div className="flex gap-0.5 md:gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-1.5 px-3 py-2 text-[10px] md:text-xs font-medium rounded-t-md transition-colors whitespace-nowrap shrink-0", activeTab === tab.id ? "bg-background text-primary border border-border border-b-transparent -mb-px" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
              <tab.icon className="h-3 w-3 md:h-3.5 md:w-3.5" />{tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'explorer' && <MarketExplorer />}
        {activeTab === 'radar' && <OpportunityRadar />}
        {activeTab === 'api-usage' && <ApiUsagePage />}
      </div>
    </div>
  );
}
