import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, DollarSign, Shield, AlertTriangle, Trash2, User, Key, Target, RotateCcw, Bell, Volume2, VolumeX, Activity, Upload, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserSettings, type UserSettings } from '@/hooks/useUserSettings';
import { useGoalProfile } from '@/hooks/useGoalProfile';
import { useNotifications, type NotificationPreferences } from '@/hooks/useNotifications';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';



type Tab = 'risk' | 'scoring' | 'profile' | 'binance' | 'notifications' | 'alerts';

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { settings: savedSettings, loading } = useUserSettings();
  const { goal, save: saveGoal } = useGoalProfile();
  const { preferences: notifPrefs, savePreferences: saveNotifPrefs } = useNotifications();
  const [settings, setSettings] = useState<UserSettings>(savedSettings);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('risk');
  const [localNotifPrefs, setLocalNotifPrefs] = useState<NotificationPreferences>(notifPrefs);

  // External alerts state
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyTelegramChatId, setNotifyTelegramChatId] = useState('');
  const [notifyOnTradeExecuted, setNotifyOnTradeExecuted] = useState(true);
  const [notifyOnStopLoss, setNotifyOnStopLoss] = useState(true);
  const [notifyOnTakeProfit, setNotifyOnTakeProfit] = useState(true);
  const [notifyOnCooldown, setNotifyOnCooldown] = useState(true);

  // Profile state
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Binance state
  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [maskedSecret, setMaskedSecret] = useState('');
  const [binanceConfigured, setBinanceConfigured] = useState(false);

  // Scoring weights state
  const [weights, setWeights] = useState<ScoringWeights>(defaultWeights);
  const [weightsLoading, setWeightsLoading] = useState(true);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(
    ['AAPL','MSFT','NVDA','TSLA','SPY','QQQ','BTC/USD','ETH/USD','EUR/USD','GBP/USD','XAU/USD']
  );

  // Load watchlist directly from DB (useUserSettings strips it)
  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('watchlist').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.watchlist && Array.isArray(data.watchlist) && data.watchlist.length > 0) {
          setLocalWatchlist(data.watchlist);
        }
      });
  }, [user]);

  useEffect(() => {
    setSettings(savedSettings);
  }, [savedSettings]);
  useEffect(() => { setLocalNotifPrefs(notifPrefs); }, [notifPrefs]);

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

  // Load Binance vault status & alert settings
  useEffect(() => {
    if (!user) return;
    const loadBinance = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('binance_key_id, binance_secret_id, notify_email, notify_telegram_chat_id, notify_on_trade_executed, notify_on_stop_loss, notify_on_take_profit, notify_on_cooldown')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        const hasKeys = !!(data as any).binance_key_id && !!(data as any).binance_secret_id;
        setBinanceConfigured(hasKeys);
        if (hasKeys) {
          setMaskedKey('••••••••••••');
          setMaskedSecret('••••••••••••');
        }
        setNotifyEmail((data as any).notify_email || '');
        setNotifyTelegramChatId((data as any).notify_telegram_chat_id || '');
        setNotifyOnTradeExecuted((data as any).notify_on_trade_executed ?? true);
        setNotifyOnStopLoss((data as any).notify_on_stop_loss ?? true);
        setNotifyOnTakeProfit((data as any).notify_on_take_profit ?? true);
        setNotifyOnCooldown((data as any).notify_on_cooldown ?? true);
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
    if (!binanceKey || !binanceSecret) {
      toast.error('Both API Key and Secret are required');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-api-keys', {
        body: { binance_api_key: binanceKey, binance_api_secret: binanceSecret },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setMaskedKey(data.masked_key);
      setMaskedSecret(data.masked_secret);
      setBinanceConfigured(true);
      setBinanceKey('');
      setBinanceSecret('');
      toast.success('Binance API keys stored securely ✓');
    } catch (e: any) {
      toast.error(`Error saving keys: ${e.message}`);
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
    { key: 'notifications', label: 'Notificaciones', icon: Bell },
    { key: 'alerts', label: 'External Alerts', icon: Send },
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
        <button
          onClick={() => navigate('/api-usage')}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-accent/50 hover:bg-accent rounded-md transition-colors text-foreground"
        >
          <Activity className="h-3.5 w-3.5 text-primary" />
          API Usage Monitor
        </button>
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
          {/* Operator Mode Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-medium text-foreground">
                  Operator Mode
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Controls whether the system executes trades automatically
                </p>
              </div>
              <span className={cn(
                "px-2 py-1 rounded text-[10px] font-mono font-bold uppercase",
                goal?.automation_level === 'full_operator'
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
              )}>
                {goal?.automation_level === 'full_operator' ? 'FULL AUTO' : 'GUIDED'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => saveGoal({ automation_level: 'guided' })}
                className={cn(
                  "p-3 rounded border text-xs font-mono text-left transition-colors",
                  goal?.automation_level === 'guided'
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <div className="font-medium">Guided</div>
                <div className="text-[10px] mt-1 opacity-70">
                  Generates signals, you approve
                </div>
              </button>
              <button
                onClick={() => saveGoal({ automation_level: 'full_operator' })}
                className={cn(
                  "p-3 rounded border text-xs font-mono text-left transition-colors",
                  goal?.automation_level === 'full_operator'
                    ? "border-green-500/50 bg-green-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-green-500/30"
                )}
              >
                <div className="font-medium">Full Operator</div>
                <div className="text-[10px] mt-1 opacity-70">
                  Executes automatically within risk limits
                </div>
              </button>
            </div>
          </div>

          {/* Watchlist Editor */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-medium text-foreground">
                  Watchlist
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Symbols monitored by the signal engine
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!user) return;
                  const { error } = await supabase.from('user_settings')
                    .update({ watchlist: localWatchlist } as any)
                    .eq('user_id', user.id);
                  if (error) { toast.error('Error saving watchlist: ' + error.message); return; }
                  toast.success('Watchlist saved');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Save className="h-3 w-3" />
                Save
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localWatchlist.map(sym => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-accent/50 border border-border rounded text-[11px] font-mono text-foreground"
                >
                  {sym}
                  <button
                    onClick={() => setLocalWatchlist(prev => prev.filter(s => s !== sym))}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const sym = watchlistInput.trim().toUpperCase();
                    if (sym && !localWatchlist.includes(sym)) {
                      setLocalWatchlist(prev => [...prev, sym]);
                    }
                    setWatchlistInput('');
                  }
                }}
                placeholder="Add symbol (e.g. AMZN)"
                className="flex-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <button
                onClick={() => {
                  const sym = watchlistInput.trim().toUpperCase();
                  if (sym && !localWatchlist.includes(sym)) {
                    setLocalWatchlist(prev => [...prev, sym]);
                  }
                  setWatchlistInput('');
                }}
                className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Add
              </button>
            </div>
          </div>

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

          {/* Signal Filters */}
          <div className="terminal-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Signal Filters
            </h2>
            <p className="text-xs text-muted-foreground">
              Minimum thresholds for signal generation and operator mode execution.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">Min Score (40–85)</label>
                <input
                  type="number"
                  min={40}
                  max={85}
                  step={1}
                  value={isNaN(settings.min_score) ? 60 : settings.min_score}
                  onChange={(e) => updateField('min_score', Math.max(40, Math.min(85, Number(e.target.value))))}
                  className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">Min R Multiple (1.0–3.0)</label>
                <input
                  type="number"
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  value={isNaN(settings.min_r) ? 1.5 : settings.min_r}
                  onChange={(e) => updateField('min_r', Math.max(1.0, Math.min(3.0, Number(e.target.value))))}
                  className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase">Min Confidence (40–80)</label>
                <input
                  type="number"
                  min={40}
                  max={80}
                  step={1}
                  value={isNaN(settings.min_confidence) ? 55 : settings.min_confidence}
                  onChange={(e) => updateField('min_confidence', Math.max(40, Math.min(80, Number(e.target.value))))}
                  className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
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
                    await supabase.from('signals').delete().eq('user_id', user.id);
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
                      supabase.from('signals').delete().eq('user_id', user.id),
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

      {/* Scoring Weights Tab */}
      {activeTab === 'scoring' && (
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeights(defaultWeights)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-md hover:bg-accent transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Reset Defaults
              </button>
              <span className={cn(
                "text-xs font-mono",
                totalWeight === 100 ? "text-profit" : "text-warning"
              )}>
                Total: {totalWeight}/100
              </span>
            </div>
            <button
              onClick={saveWeights}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Weights'}
            </button>
          </div>

          <div className="terminal-border rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-warning" />
              Opportunity Score Weights
            </h2>
            <p className="text-xs text-muted-foreground">
              Personaliza la importancia relativa de cada factor en el cálculo del Opportunity Score (0-100). Los pesos se normalizan automáticamente.
            </p>

            <div className="space-y-4">
              {([
                { field: 'structure_weight' as const, label: 'Structure', desc: 'Alineación de tendencia, SMAs y posición respecto a S/R', icon: '🏗️' },
                { field: 'momentum_weight' as const, label: 'Momentum', desc: 'RSI, MACD y aceleración del precio', icon: '🚀' },
                { field: 'volatility_weight' as const, label: 'Volatility', desc: 'Régimen de volatilidad: compresión = oportunidad', icon: '⚡' },
                { field: 'strategy_weight' as const, label: 'Strategy', desc: 'Favorabilidad del régimen de mercado para trading', icon: '♟️' },
                { field: 'rr_weight' as const, label: 'Risk:Reward', desc: 'Ratio riesgo/beneficio basado en S/R', icon: '🎯' },
                { field: 'macro_weight' as const, label: 'Macro', desc: 'Contexto macro derivado de SMA50 vs SMA200', icon: '🌍' },
                { field: 'sentiment_weight' as const, label: 'Sentiment', desc: 'Sentimiento contrarian basado en extremos RSI', icon: '💭' },
                { field: 'historical_weight' as const, label: 'Historical', desc: 'Win rate y R-múltiplo de tu historial de trades', icon: '📊' },
              ]).map(({ field, label, desc, icon }) => {
                const value = weights[field] as number;
                const pct = totalWeight > 0 ? (value / totalWeight * 100) : 0;
                return (
                  <div key={field} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{icon}</span>
                        <div>
                          <span className="text-xs font-bold text-foreground">{label}</span>
                          <p className="text-[10px] text-muted-foreground">{desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-muted-foreground">{pct.toFixed(0)}%</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          onChange={(e) => updateWeight(field, Math.max(0, Math.min(100, Number(e.target.value))))}
                          className="w-16 px-2 py-1 bg-background border border-border rounded-md text-xs text-foreground font-mono text-right focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", 
                          pct > 20 ? "bg-primary" : pct > 10 ? "bg-warning" : "bg-muted-foreground"
                        )}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual weight distribution */}
            <div className="rounded-md bg-accent/50 p-3 space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Distribución de pesos</p>
              <div className="flex h-4 rounded-full overflow-hidden">
                {[
                  { field: 'structure_weight' as const, color: 'bg-primary' },
                  { field: 'momentum_weight' as const, color: 'bg-profit' },
                  { field: 'volatility_weight' as const, color: 'bg-warning' },
                  { field: 'strategy_weight' as const, color: 'bg-info' },
                  { field: 'rr_weight' as const, color: 'bg-accent-foreground' },
                  { field: 'macro_weight' as const, color: 'bg-muted-foreground' },
                  { field: 'sentiment_weight' as const, color: 'bg-loss' },
                  { field: 'historical_weight' as const, color: 'bg-secondary-foreground' },
                ].map(({ field, color }) => {
                  const val = weights[field] as number;
                  const pct = totalWeight > 0 ? (val / totalWeight * 100) : 0;
                  return pct > 0 ? (
                    <div key={field} className={cn("h-full", color)} style={{ width: `${pct}%` }} title={`${field.replace('_weight', '')}: ${val}`} />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  { label: 'STR', color: 'bg-primary' },
                  { label: 'MOM', color: 'bg-profit' },
                  { label: 'VOL', color: 'bg-warning' },
                  { label: 'STRAT', color: 'bg-info' },
                  { label: 'R:R', color: 'bg-accent-foreground' },
                  { label: 'MAC', color: 'bg-muted-foreground' },
                  { label: 'SENT', color: 'bg-loss' },
                  { label: 'HIST', color: 'bg-secondary-foreground' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={cn("h-2 w-2 rounded-full", color)} />
                    <span className="text-[9px] font-mono text-muted-foreground">{label}</span>
                  </div>
                ))}
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

            {/* Avatar preview & upload */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-accent border border-border flex items-center justify-center overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] text-muted-foreground font-mono uppercase">Foto de perfil</label>
                <label className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md cursor-pointer transition-colors border border-border",
                  uploadingAvatar ? "bg-muted text-muted-foreground cursor-wait" : "bg-accent/50 hover:bg-accent text-foreground"
                )}>
                  {uploadingAvatar ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> Subir imagen</>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !user) return;
                      setUploadingAvatar(true);
                      const ext = file.name.split('.').pop();
                      const filePath = `${user.id}/avatar.${ext}`;
                      const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(filePath, file, { upsert: true });
                      if (uploadError) {
                        toast.error('Error al subir imagen');
                        setUploadingAvatar(false);
                        return;
                      }
                      const { data: urlData } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(filePath);
                      const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                      setAvatarUrl(newUrl);
                      // Auto-save to profile
                      await supabase.from('profiles').update({
                        avatar_url: newUrl,
                        updated_at: new Date().toISOString(),
                      }).eq('id', user.id);
                      toast.success('Avatar actualizado ✓');
                      setUploadingAvatar(false);
                    }}
                  />
                </label>
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
              {saving ? 'Saving...' : binanceConfigured ? 'Update API Keys' : 'Save API Keys'}
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
            <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
              <p className="text-[10px] text-muted-foreground font-mono">
                🔐 Las claves se almacenan de forma segura en el vault del servidor. Nunca se guardan en texto plano.
              </p>
            </div>

            {binanceConfigured && (
              <div className="rounded-md bg-accent/50 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground font-mono">
                  🟢 API Key: <span className="text-foreground">{maskedKey}</span>
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  🟢 API Secret: <span className="text-foreground">{maskedSecret}</span>
                </p>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">
                {binanceConfigured ? 'New API Key (leave empty to keep current)' : 'API Key'}
              </label>
              <input
                type="text"
                value={binanceKey}
                onChange={(e) => setBinanceKey(e.target.value)}
                placeholder={binanceConfigured ? 'Enter new API Key to update' : 'Tu API Key de Binance'}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">
                {binanceConfigured ? 'New API Secret (leave empty to keep current)' : 'API Secret'}
              </label>
              <input
                type="password"
                value={binanceSecret}
                onChange={(e) => setBinanceSecret(e.target.value)}
                placeholder={binanceConfigured ? 'Enter new API Secret to update' : 'Tu API Secret de Binance'}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            {!binanceConfigured && (
              <div className="rounded-md bg-accent/50 p-3">
                <p className="text-[10px] text-muted-foreground font-mono">
                  Estado: 🔴 No configurada
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="max-w-2xl space-y-6">
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setSaving(true);
                await saveNotifPrefs(localNotifPrefs);
                toast.success('Preferencias de notificación guardadas ✓');
                setSaving(false);
              }}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Guardar'}
            </button>
          </div>

          <div className="terminal-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Preferencias de Notificación
            </h2>
            <p className="text-xs text-muted-foreground">
              Configura qué notificaciones recibir y cuáles deben tener sonido de alerta.
            </p>

            <div className="space-y-3">
              {([
                { key: 'sl_tp', label: '🎯 Stop Loss / Take Profit', desc: 'Alerta cuando el precio alcanza tu SL o TP', critical: true },
                { key: 'risk_alerts', label: '🛡️ Alertas de Riesgo', desc: 'Drawdown máximo, posiciones excedidas, límites de riesgo', critical: true },
                { key: 'regime_change', label: '📊 Cambio de Régimen', desc: 'Cuando un activo cambia de régimen de mercado' },
                { key: 'signals', label: '💡 Señales de Trade', desc: 'Nuevas señales generadas por los agentes' },
                { key: 'pnl_threshold', label: '💰 PnL Significativo', desc: 'Cuando una posición supera el umbral de ganancia/pérdida' },
                { key: 'agents', label: '🤖 Agentes Completados', desc: 'Cuando finaliza un análisis de agentes' },
              ] as { key: string; label: string; desc: string; critical?: boolean }[]).map(({ key, label, desc, critical }) => {
                const enabledKey = `${key}_enabled` as keyof NotificationPreferences;
                const soundKey = `${key}_sound` as keyof NotificationPreferences;
                return (
                  <div key={key} className={cn(
                    "flex items-center justify-between p-3 rounded-md border transition-colors",
                    localNotifPrefs[enabledKey] ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-60"
                  )}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        {critical && <span className="text-[9px] px-1.5 py-0.5 rounded bg-loss/10 text-loss font-bold">CRÍTICO</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                      {key === 'pnl_threshold' && localNotifPrefs.pnl_threshold_enabled && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-[10px] text-muted-foreground font-mono">Umbral:</label>
                          <input
                            type="number"
                            step="1"
                            value={localNotifPrefs.pnl_threshold_percent}
                            onChange={(e) => setLocalNotifPrefs(p => ({ ...p, pnl_threshold_percent: Number(e.target.value) }))}
                            className="w-16 px-2 py-1 bg-background border border-border rounded text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localNotifPrefs[enabledKey] as boolean}
                          onChange={(e) => setLocalNotifPrefs(p => ({ ...p, [enabledKey]: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="text-[10px] text-muted-foreground font-mono">ON</span>
                      </label>
                      <button
                        onClick={() => setLocalNotifPrefs(p => ({ ...p, [soundKey]: !(p[soundKey] as boolean) }))}
                        disabled={!localNotifPrefs[enabledKey]}
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          localNotifPrefs[soundKey] ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
                          !localNotifPrefs[enabledKey] && "opacity-30 cursor-not-allowed"
                        )}
                        title={localNotifPrefs[soundKey] ? 'Sonido activado' : 'Sonido desactivado'}
                      >
                        {localNotifPrefs[soundKey] ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* External Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="max-w-lg space-y-6">
          <div className="flex justify-end">
            <button
              onClick={async () => {
                if (!user) return;
                setSaving(true);
                const { error } = await supabase.from('user_settings').upsert({
                  user_id: user.id,
                  notify_email: notifyEmail || null,
                  notify_telegram_chat_id: notifyTelegramChatId || null,
                  notify_on_trade_executed: notifyOnTradeExecuted,
                  notify_on_stop_loss: notifyOnStopLoss,
                  notify_on_take_profit: notifyOnTakeProfit,
                  notify_on_cooldown: notifyOnCooldown,
                  updated_at: new Date().toISOString(),
                } as any, { onConflict: 'user_id' });
                if (error) toast.error('Error saving alert settings');
                else toast.success('Alert settings saved ✓');
                setSaving(false);
              }}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Alerts'}
            </button>
          </div>

          <div className="terminal-border rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              External Alerts (Telegram / Email)
            </h2>
            <p className="text-xs text-muted-foreground">
              Recibe notificaciones externas cuando se ejecutan trades, se activan stop loss/take profit o se activa cooldown.
            </p>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Email</label>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="alerts@example.com"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Requiere Resend API Key configurado en el backend</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Telegram Chat ID</label>
              <input
                type="text"
                value={notifyTelegramChatId}
                onChange={(e) => setNotifyTelegramChatId(e.target.value)}
                placeholder="123456789"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Envía un mensaje a <span className="text-primary">@userinfobot</span> en Telegram para obtener tu Chat ID
              </p>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Eventos</p>
              {([
                { label: '🤖 Trade Ejecutado', desc: 'Cuando el operador ejecuta trades automáticos', checked: notifyOnTradeExecuted, onChange: setNotifyOnTradeExecuted },
                { label: '🔴 Stop Loss', desc: 'Cuando se activa un stop loss', checked: notifyOnStopLoss, onChange: setNotifyOnStopLoss },
                { label: '🟢 Take Profit', desc: 'Cuando se alcanza un take profit', checked: notifyOnTakeProfit, onChange: setNotifyOnTakeProfit },
                { label: '⚠️ Cooldown', desc: 'Cuando se activa el cooldown por pérdidas consecutivas', checked: notifyOnCooldown, onChange: setNotifyOnCooldown },
              ]).map(({ label, desc, checked, onChange }) => (
                <div key={label} className={cn(
                  "flex items-center justify-between p-3 rounded-md border transition-colors",
                  checked ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-60"
                )}>
                  <div>
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onChange(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-[10px] text-muted-foreground font-mono">ON</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
