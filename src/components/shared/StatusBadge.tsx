import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = 'profit' | 'loss' | 'warning' | 'info' | 'neutral' | 'primary';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  profit: 'bg-profit/15 text-profit border-profit/20',
  loss: 'bg-loss/15 text-loss border-loss/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  info: 'bg-primary/15 text-primary border-primary/20',
  neutral: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-primary/15 text-primary border-primary/20',
};

const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ children, variant = 'neutral', className, dot }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono",
          variantStyles[variant],
          className
        )}
      >
        {dot && <span className={cn("h-1.5 w-1.5 rounded-full", {
          'bg-profit': variant === 'profit',
          'bg-loss': variant === 'loss',
          'bg-warning': variant === 'warning',
          'bg-primary': variant === 'info' || variant === 'primary',
          'bg-muted-foreground': variant === 'neutral',
        })} />}
        {children}
      </span>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export default StatusBadge;
