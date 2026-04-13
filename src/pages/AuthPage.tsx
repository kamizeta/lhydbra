import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n';
import lhydbraLogo from '@/assets/lhydbra-logo.png';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConfirmMessage('');
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        setError(error.message);
      } else {
        setConfirmMessage(t.auth.confirmEmail);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-terminal-cyan/5 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-terminal-gold/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <img src={lhydbraLogo} alt="LHYDBRA" style={{ height: '240px', width: '240px' }} className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-foreground tracking-[0.25em]">LHYDBRA</h1>
          <p className="text-sm text-terminal-gold font-mono mt-2 tracking-wider">Intelligence. Balance. Evolution.</p>
        </div>

        <div className="terminal-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground text-center">
            {isLogin ? t.auth.signIn : t.auth.createAccount}
          </h2>

          {error && (
            <div className="bg-loss/10 border border-loss/20 rounded-md p-3 text-xs text-loss">{error}</div>
          )}
          {confirmMessage && (
            <div className="bg-primary/10 border border-primary/20 rounded-md p-3 text-xs text-primary">{confirmMessage}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t.auth.fullName}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t.auth.email}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t.auth.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : isLogin ? t.auth.signIn : t.auth.createAccount}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setConfirmMessage('');
              }}
              className="text-xs text-primary hover:underline font-mono"
            >
              {isLogin ? t.auth.noAccount : t.auth.hasAccount}
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground font-mono mt-6">
          {t.auth.tagline}
        </p>
      </div>
    </div>
  );
}
