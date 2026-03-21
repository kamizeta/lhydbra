import { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  monthlyTarget: number;
  monthPnl: number;
  dailyTarget: number;
  todayPnl: number;
  tradingDaysPassed: number;
  className?: string;
}

export default function GoalProgress({ monthlyTarget, monthPnl, dailyTarget, todayPnl, tradingDaysPassed, className }: Props) {
  const progressPct = Math.min(Math.max((monthPnl / monthlyTarget) * 100, 0), 100);
  const expectedPct = Math.min((tradingDaysPassed / 22) * 100, 100);
  const pace = progressPct >= expectedPct ? 'ahead' : progressPct >= expectedPct * 0.8 ? 'on_track' : 'behind';
  const remaining = Math.max(monthlyTarget - monthPnl, 0);
  const remainingDays = Math.max(22 - tradingDaysPassed, 1);
  const requiredDaily = remaining / remainingDays;
  const dailyProgressPct = Math.min(Math.max((todayPnl / dailyTarget) * 100, 0), 120);

  const PaceIcon = pace === 'ahead' ? TrendingUp : pace === 'behind' ? TrendingDown : Minus;

  return (
    <div className={cn("terminal-border rounded-lg p-4 space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-primary" /> Monthly Goal
        </h2>
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full",
          pace === 'ahead' ? "bg-profit/10 text-profit" :
          pace === 'on_track' ? "bg-primary/10 text-primary" :
          "bg-loss/10 text-loss"
        )}>
          <PaceIcon className="h-3 w-3" />
          {pace === 'ahead' ? 'Ahead' : pace === 'on_track' ? 'On Track' : 'Behind'}
        </div>
      </div>

      {/* Monthly progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>${monthPnl.toFixed(0)} earned</span>
          <span>${monthlyTarget.toLocaleString()} target</span>
        </div>
        <div className="relative h-3 rounded-full bg-muted overflow-hidden">
          {/* Expected pace marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/30 z-10"
            style={{ left: `${expectedPct}%` }}
          />
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              pace === 'ahead' ? "bg-profit" : pace === 'on_track' ? "bg-primary" : "bg-warning"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-muted-foreground">{progressPct.toFixed(0)}% complete</span>
          <span className="text-muted-foreground">${remaining.toFixed(0)} remaining</span>
        </div>
      </div>

      {/* Today's progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>Today: ${todayPnl.toFixed(0)}</span>
          <span>Target: ${dailyTarget.toFixed(0)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              todayPnl >= dailyTarget ? "bg-profit" : todayPnl >= 0 ? "bg-primary" : "bg-loss"
            )}
            style={{ width: `${Math.min(dailyProgressPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="bg-accent/30 rounded-md p-2">
          <span className="text-muted-foreground">Req. daily</span>
          <div className={cn("font-bold", requiredDaily <= dailyTarget * 1.3 ? "text-foreground" : "text-loss")}>
            ${requiredDaily.toFixed(0)}
          </div>
        </div>
        <div className="bg-accent/30 rounded-md p-2">
          <span className="text-muted-foreground">Days left</span>
          <div className="font-bold text-foreground">{remainingDays}</div>
        </div>
      </div>
    </div>
  );
}
