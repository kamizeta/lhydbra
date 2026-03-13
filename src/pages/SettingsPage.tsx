import { useState, useEffect } from 'react';
import { Settings, Save, DollarSign, Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';

interface UserSettings {
  initial_capital: number;
  current_capital: number;
  risk_per_trade: number;
  max_daily_risk: number;
  max_weekly_risk: number;
  max_drawdown: number;
  max_positions: number;
  max_leverage: number;
  max_single_asset: number;
  max_correlation: number;
  stop_loss_required: boolean;
  min_rr_ratio: number;
}

const defaultSettings: UserSettings = {
  initial_capital: 10000,
  current_capital: 10000,
  risk_per_trade: 1.5,
  max_daily_risk: 5,
  max_weekly_risk: 10,
  max_drawdown: 15,
  max_positions: 10,
  max_leverage: 2.0,
  max_single_asset: 25,
  max_correlation: 80,
  stop_loss_required: true,
  min_rr_ratio: 1.5,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (data) {
      setSettings({
        initial_capital: Number(data.initial_capital),
        current_capital: Number(data.current_capital),
        risk_per_trade: Number(data.risk_per_trade),
        max_daily_risk: Number(data.max_daily_risk),
        max_weekly_risk: Number(data.max_weekly_risk),
        max_drawdown: Number(data.max_drawdown),
        max_positions: Number(data.max_positions),
        max_leverage: Number(data.max_leverage),
        max_single_asset: Number(data.max_single_asset),
        max_correlation: Number(data.max_correlation),
        stop_loss_required: Boolean(data.stop_loss_required),
        min_rr_ratio: Number(data.min_rr_ratio),
      });
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        ...settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      toast.error('Error saving settings');
    } else {
      toast.success('Settings saved');
    }
    setSaving(false);
  };

  const updateField = (field: keyof UserSettings, value: number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const dollarAtRisk = settings.current_capital * (settings.risk_per_trade / 100);

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            {t.riskMgmt.positionSizing}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">Capital • Risk Parameters • Trading Rules</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Capital */}
        <div className="terminal-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Capital
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">{t.riskMgmt.accountSize}</label>
              <input
                type="number"
                value={settings.initial_capital}
                onChange={(e) => updateField('initial_capital', Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Current Capital</label>
              <input
                type="number"
                value={settings.current_capital}
                onChange={(e) => updateField('current_capital', Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
            <p className="text-xs text-muted-foreground font-mono">{t.riskMgmt.dollarAtRisk}</p>
            <p className="text-lg font-bold text-primary font-mono">${dollarAtRisk.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{settings.risk_per_trade}% × ${settings.current_capital.toLocaleString()}</p>
          </div>
        </div>

        {/* Risk Parameters */}
        <div className="terminal-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t.riskMgmt.riskRules}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t.riskMgmt.riskPercent, field: 'risk_per_trade' as const, suffix: '%' },
              { label: t.riskMgmt.maxDailyRisk, field: 'max_daily_risk' as const, suffix: '%' },
              { label: t.riskMgmt.maxWeeklyRisk, field: 'max_weekly_risk' as const, suffix: '%' },
              { label: t.riskMgmt.maxDrawdown, field: 'max_drawdown' as const, suffix: '%' },
              { label: t.riskMgmt.maxPositions, field: 'max_positions' as const, suffix: '' },
              { label: t.riskMgmt.maxLeverage, field: 'max_leverage' as const, suffix: 'x' },
              { label: t.riskMgmt.maxSingleAsset, field: 'max_single_asset' as const, suffix: '%' },
              { label: t.riskMgmt.maxCorrelation, field: 'max_correlation' as const, suffix: '%' },
              { label: t.riskMgmt.minRRRatio, field: 'min_rr_ratio' as const, suffix: ':1' },
            ].map(({ label, field, suffix }) => (
              <div key={field}>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">{label}</label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step={field === 'max_positions' ? 1 : 0.1}
                    value={settings[field]}
                    onChange={(e) => updateField(field, Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                  {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={settings.stop_loss_required}
              onChange={(e) => updateField('stop_loss_required', e.target.checked)}
              className="rounded border-border"
            />
            <label className="text-xs text-muted-foreground font-mono">
              <AlertTriangle className="h-3 w-3 inline mr-1 text-warning" />
              {t.riskMgmt.stopLossRequired} {t.riskMgmt.required}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
