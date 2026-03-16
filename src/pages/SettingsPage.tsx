import { useState, useEffect } from 'react';
import { Settings, Save, DollarSign, Shield, AlertTriangle, Trash2, User, Key, Target, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserSettings, type UserSettings } from '@/hooks/useUserSettings';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Tab = 'risk' | 'scoring' | 'profile' | 'binance';

interface ScoringWeights {
  structure_weight: number;
  momentum_weight: number;
  volatility_weight: number;
  strategy_weight: number;
  rr_weight: number;
  macro_weight: number;
  sentiment_weight: number;
  historical_weight: number;
  name: string;
}

const defaultWeights: ScoringWeights = {
  structure_weight: 15, momentum_weight: 15, volatility_weight: 10,
  strategy_weight: 15, rr_weight: 15, macro_weight: 10,
  sentiment_weight: 10, historical_weight: 10, name: 'default',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { settings: savedSettings, loading } = useUserSettings();
  const [settings, setSettings] = useState<UserSettings>(savedSettings);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('risk');

  // Profile state
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  // Binance state
  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');

  // Scoring weights state
  const [weights, setWeights] = useState<ScoringWeights>(defaultWeights);
  const [weightsLoading, setWeightsLoading] = useState(true);

  useEffect(() => {
    setSettings(savedSettings);
  }, [savedSettings]);

  // Load profile
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name || '');
        setAvatarUrl((data as any).avatar_url || '');
      }
      setProfileLoading(false);
    };
    loadProfile();
  }, [user]);

  // Load Binance keys
  useEffect(() => {
    if (!user) return;
    const loadBinance = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('binance_api_key, binance_api_secret')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setBinanceKey((data as any).binance_api_key || '');
        setBinanceSecret((data as any).binance_api_secret || '');
      }
    };
    loadBinance();
  }, [user]);

  // Load scoring weights
  useEffect(() => {
    if (!user) return;
    const loadWeights = async () => {
      const { data } = await supabase
        .from('scoring_weights')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        setWeights({
          structure_weight: Number(data.structure_weight),
          momentum_weight: Number(data.momentum_weight),
          volatility_weight: Number(data.volatility_weight),
          strategy_weight: Number(data.strategy_weight),
          rr_weight: Number(data.rr_weight),
          macro_weight: Number(data.macro_weight),
          sentiment_weight: Number(data.sentiment_weight),
          historical_weight: Number(data.historical_weight),
          name: data.name,
        });
      }
      setWeightsLoading(false);
    };
    loadWeights();
  }, [user]);

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
      toast.success('Settings saved ✓');
    }
    setSaving(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('Error saving profile');
    } else {
      toast.success('Profile saved ✓');
    }
    setSaving(false);
  };

  const saveBinance = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        binance_api_key: binanceKey,
        binance_api_secret: binanceSecret,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      toast.error('Error saving Binance keys');
    } else {
      toast.success('Binance API keys saved ✓');
    }
    setSaving(false);
  };

  const saveWeights = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('scoring_weights')
      .upsert({
        user_id: user.id,
        ...weights,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,name' });

    if (error) {
      toast.error('Error saving scoring weights');
    } else {
      toast.success('Scoring weights saved ✓');
    }
    setSaving(false);
  };

  const updateField = (field: keyof UserSettings, value: number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const updateWeight = (field: keyof ScoringWeights, value: number) => {
    setWeights(prev => ({ ...prev, [field]: value }));
  };

  const totalWeight = weights.structure_weight + weights.momentum_weight +
    weights.volatility_weight + weights.strategy_weight + weights.rr_weight +
    weights.macro_weight + weights.sentiment_weight + weights.historical_weight;

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const dollarAtRisk = settings.current_capital * (settings.risk_per_trade / 100);

  const tabs: { key: Tab; label: string; icon: typeof Settings }[] = [
    { key: 'risk', label: 'Capital & Riesgo', icon: Shield },
    { key: 'scoring', label: 'Scoring Weights', icon: Target },
    { key: 'profile', label: 'Perfil', icon: User },
    { key: 'binance', label: 'Binance API', icon: Key },
  ];

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground font-mono">Configuración de cuenta y parámetros</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Risk Tab */}
      {activeTab === 'risk' && (
        <div className="space-y-6">
          <div className="flex justify-end">
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

            {/* Reset Section */}
            <div className="lg:col-span-2 terminal-border rounded-lg p-5 space-y-4 border-destructive/30">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                Reset Data
              </h2>
              <p className="text-xs text-muted-foreground">
                Elimina todas las posiciones, señales de trade y reinicia los datos de tu cuenta. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={async () => {
                    if (!user || !confirm('¿Eliminar todas las posiciones abiertas y cerradas?')) return;
                    await supabase.from('positions').delete().eq('user_id', user.id);
                    toast.success('Posiciones eliminadas ✓');
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-xs font-medium hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Borrar Posiciones
                </button>
                <button
                  onClick={async () => {
                    if (!user || !confirm('¿Eliminar todas las señales de trade?')) return;
                    await supabase.from('trade_signals').delete().eq('user_id', user.id);
                    toast.success('Señales eliminadas ✓');
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-xs font-medium hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Borrar Señales
                </button>
                <button
                  onClick={async () => {
                    if (!user || !confirm('⚠️ ¿BORRAR TODO? Posiciones, señales y resetear capital. Esta acción no se puede deshacer.')) return;
                    await Promise.all([
                      supabase.from('positions').delete().eq('user_id', user.id),
                      supabase.from('trade_signals').delete().eq('user_id', user.id),
                    ]);
                    toast.success('Todo reseteado ✓');
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-xs font-bold hover:bg-destructive/90 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Resetear Todo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="max-w-lg space-y-6">
          <div className="flex justify-end">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <div className="terminal-border rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Perfil de Usuario
            </h2>

            {/* Avatar preview */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-accent border border-border flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground font-mono uppercase">URL de Avatar</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Nombre completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground font-mono cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">El email no se puede cambiar</p>
            </div>
          </div>
        </div>
      )}

      {/* Binance Tab */}
      {activeTab === 'binance' && (
        <div className="max-w-lg space-y-6">
          <div className="flex justify-end">
            <button
              onClick={saveBinance}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save API Keys'}
            </button>
          </div>

          <div className="terminal-border rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Binance API
            </h2>
            <p className="text-xs text-muted-foreground">
              Conecta tu cuenta de Binance para ejecutar órdenes de cripto directamente desde LHYDBRA. 
              Necesitas crear una API Key en <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-primary underline">Binance API Management</a>.
            </p>
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
              <p className="text-[10px] text-warning font-mono">
                ⚠️ IMPORTANTE: Usa permisos de solo "Spot Trading" y activa la lista blanca de IP para mayor seguridad. Nunca actives permisos de retiro.
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">API Key</label>
              <input
                type="text"
                value={binanceKey}
                onChange={(e) => setBinanceKey(e.target.value)}
                placeholder="Tu API Key de Binance"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">API Secret</label>
              <input
                type="password"
                value={binanceSecret}
                onChange={(e) => setBinanceSecret(e.target.value)}
                placeholder="Tu API Secret de Binance"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div className="rounded-md bg-accent/50 p-3">
              <p className="text-[10px] text-muted-foreground font-mono">
                Estado: {binanceKey ? '🟢 API Key configurada' : '🔴 No configurada'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
