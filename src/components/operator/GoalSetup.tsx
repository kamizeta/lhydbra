import { useState } from 'react';
import { Target, DollarSign, TrendingUp, Shield, Zap } from 'lucide-react';
import { useGoalProfile, type GoalProfile } from '@/hooks/useGoalProfile';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  onComplete?: () => void;
}

export default function GoalSetup({ onComplete }: Props) {
  const { goal, save, exists } = useGoalProfile();
  const { t } = useI18n();
  const [monthlyTarget, setMonthlyTarget] = useState(goal.monthly_target);
  const [capital, setCapital] = useState(goal.capital_available);
  const [risk, setRisk] = useState<string>(goal.risk_tolerance);
  const [automation, setAutomation] = useState<GoalProfile['automation_level']>(goal.automation_level);
  const [saving, setSaving] = useState(false);

  const tradingDays = 22;
  const dailyTarget = monthlyTarget / tradingDays;
  const riskPct = risk === 'conservative' ? 0.5 : risk === 'aggressive' ? 1.5 : 1;
  const riskPerTrade = capital * (riskPct / 100);
  const requiredR = riskPerTrade > 0 ? dailyTarget / riskPerTrade : 0;
  const requiredTrades = Math.min(Math.ceil(requiredR / 1.8), 3);

  const handleSave = async () => {
    setSaving(true);
    await save({
      monthly_target: monthlyTarget,
      capital_available: capital,
      risk_tolerance: risk,
      automation_level: automation,
    });
    toast.success(t.goal.goalSaved);
    setSaving(false);
    onComplete?.();
  };

  const feasible = requiredR <= 4 && requiredTrades <= 3;

  return (
    <div className="terminal-border rounded-lg p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold text-foreground">{exists ? t.goal.updateTitle : t.goal.setTitle}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground font-mono uppercase">{t.goal.monthlyTarget}</label>
          <div className="relative mt-1">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="number" value={monthlyTarget} onChange={e => setMonthlyTarget(Number(e.target.value))}
              className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-mono uppercase">{t.goal.availableCapital}</label>
          <div className="relative mt-1">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
              className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-mono uppercase mb-2 block">{t.goal.riskTolerance}</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'conservative', label: t.goal.conservative, desc: t.goal.conservativeDesc, icon: Shield },
            { key: 'moderate', label: t.goal.moderate, desc: t.goal.moderateDesc, icon: TrendingUp },
            { key: 'aggressive', label: t.goal.aggressive, desc: t.goal.aggressiveDesc, icon: Zap },
          ].map(opt => (
            <button key={opt.key} onClick={() => setRisk(opt.key)}
              className={cn("p-3 rounded-lg border text-left transition-all",
                risk === opt.key ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-primary/40 text-muted-foreground")}>
              <opt.icon className={cn("h-4 w-4 mb-1", risk === opt.key ? "text-primary" : "text-muted-foreground")} />
              <div className="text-xs font-medium">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-mono uppercase mb-2 block">{t.goal.automationLevel}</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'guided' as const, label: t.goal.guided, desc: t.goal.guidedDesc },
            { key: 'assisted' as const, label: t.goal.assisted, desc: t.goal.assistedDesc },
            { key: 'full_operator' as const, label: t.goal.fullAuto, desc: t.goal.fullAutoDesc },
          ].map(opt => (
            <button key={opt.key} onClick={() => setAutomation(opt.key)}
              className={cn("p-3 rounded-lg border text-left transition-all",
                automation === opt.key ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-primary/40 text-muted-foreground")}>
              <div className="text-xs font-medium">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={cn("rounded-lg p-4 border", feasible ? "bg-primary/5 border-primary/20" : "bg-loss/5 border-loss/20")}>
        <h3 className="text-xs font-bold text-foreground mb-2">{t.goal.tradingPlan}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">{t.goal.dailyTarget}</span>
            <div className="font-mono font-bold text-foreground">${dailyTarget.toFixed(0)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t.goal.riskPerTrade}</span>
            <div className="font-mono font-bold text-foreground">${riskPerTrade.toFixed(0)} ({riskPct}%)</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t.goal.requiredRDay}</span>
            <div className={cn("font-mono font-bold", requiredR <= 3 ? "text-foreground" : "text-loss")}>{requiredR.toFixed(1)}R</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t.goal.tradesPerDay}</span>
            <div className="font-mono font-bold text-foreground">{requiredTrades}</div>
          </div>
        </div>
        {!feasible && (
          <p className="mt-2 text-[10px] text-loss font-mono">{t.goal.unrealisticWarning}</p>
        )}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
        {saving ? t.common.saving : exists ? t.goal.updateGoal : t.goal.setGoalStart}
      </button>
    </div>
  );
}