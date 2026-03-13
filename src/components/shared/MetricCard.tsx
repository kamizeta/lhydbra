import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  subtitle?: string;
  className?: string;
}

export default function MetricCard({ label, value, change, changeType = 'neutral', icon: Icon, subtitle, className }: MetricCardProps) {
  return (
    <div className={cn("terminal-border rounded-lg p-4", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
          {change && (
            <p className={cn(
              "mt-1 text-xs font-mono",
              changeType === 'positive' && "text-profit",
              changeType === 'negative' && "text-loss",
              changeType === 'neutral' && "text-muted-foreground"
            )}>
              {change}
            </p>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="rounded-md bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
