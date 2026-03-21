import { MessageSquare, AlertTriangle, Lightbulb, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  grade?: string;
  message?: string;
  mistakes?: string[];
  suggestions?: string[];
  loading?: boolean;
  className?: string;
}

const gradeColors: Record<string, string> = {
  'A+': 'text-profit bg-profit/10',
  'A': 'text-profit bg-profit/10',
  'B+': 'text-primary bg-primary/10',
  'B': 'text-primary bg-primary/10',
  'C+': 'text-warning bg-warning/10',
  'C': 'text-loss bg-loss/10',
};

export default function CoachingPanel({ grade, message, mistakes, suggestions, loading, className }: Props) {
  if (loading) {
    return (
      <div className={cn("terminal-border rounded-lg p-4 animate-pulse", className)}>
        <div className="h-4 bg-muted rounded w-1/3 mb-3" />
        <div className="h-3 bg-muted rounded w-full mb-2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (!message) return null;

  return (
    <div className={cn("terminal-border rounded-lg p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-primary" /> AI Coach
        </h2>
        {grade && (
          <span className={cn(
            "text-xs font-mono font-bold px-2 py-0.5 rounded-full",
            gradeColors[grade] || "text-muted-foreground bg-muted"
          )}>
            <Award className="h-3 w-3 inline mr-1" />
            {grade}
          </span>
        )}
      </div>

      <p className="text-xs text-foreground leading-relaxed">{message}</p>

      {mistakes && mistakes.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-loss uppercase flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Issues Detected
          </span>
          {mistakes.map((m, i) => (
            <div key={i} className="text-[10px] font-mono text-loss/80 pl-4">• {m}</div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-primary uppercase flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Suggestions
          </span>
          {suggestions.map((s, i) => (
            <div key={i} className="text-[10px] font-mono text-muted-foreground pl-4">• {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
