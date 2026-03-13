import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showValue?: boolean;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  className?: string;
}

export default function ProgressBar({ value, max, label, showValue = true, variant = 'default', className }: ProgressBarProps) {
  const percent = Math.min((value / max) * 100, 100);
  const autoVariant = percent > 80 ? 'danger' : percent > 60 ? 'warning' : variant;

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="font-mono text-foreground">{value.toFixed(1)}% / {max}%</span>}
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            autoVariant === 'danger' && "bg-loss",
            autoVariant === 'warning' && "bg-warning",
            autoVariant === 'success' && "bg-profit",
            autoVariant === 'default' && "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
