import { useState } from "react";
import { Briefcase, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import PositionsPage from "@/pages/PositionsPage";
import Journal from "@/pages/Journal";

type TabId = 'positions' | 'journal';

const TABS: { id: TabId; label: string; icon: typeof Briefcase }[] = [
  { id: 'positions', label: 'Posiciones', icon: Briefcase },
  { id: 'journal', label: 'Diario', icon: BookOpen },
];

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<TabId>('positions');

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-6 pt-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-background text-primary border border-border border-b-transparent -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && <PositionsPage />}
        {activeTab === 'journal' && <Journal />}
      </div>
    </div>
  );
}
