import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, Bot, Briefcase,
  ChevronLeft, ChevronRight, Activity, Settings, LogOut, Menu, X,
  Zap, FlaskConical, Brain, PieChart, TrendingUp, BookOpen, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import LanguageSelector from "@/components/LanguageSelector";
import NotificationBell from "@/components/NotificationBell";
import lhydbraLogo from "@/assets/lhydbra-logo.png";
import { useRegimeAlerts } from "@/hooks/useRegimeAlerts";
import { usePositionAlerts } from "@/hooks/usePositionAlerts";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  useRegimeAlerts();
  usePositionAlerts();

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.full_name) setDisplayName(data.full_name);
      });
  }, [user]);

  const coreNavItems = [
    { to: "/", icon: LayoutDashboard, label: t.nav.operator },
    { to: "/signals", icon: Zap, label: t.nav.signals },
    { to: "/trade-ideas", icon: Activity, label: t.nav.tradeIdeas },
    { to: "/portfolio", icon: Briefcase, label: t.nav.portfolio },
    { to: "/positions", icon: TrendingUp, label: "Positions" },
    { to: "/allocation", icon: PieChart, label: t.nav.allocation },
    { to: "/settings", icon: Settings, label: t.nav.settings },
  ];

  const advancedNavItems = [
    { to: "/advanced/agents", icon: Bot, label: t.nav.agents },
    { to: "/advanced/strategy-lab", icon: FlaskConical, label: t.nav.strategyLab },
    { to: "/advanced/learning", icon: Brain, label: t.nav.learning },
    { to: "/advanced/market", icon: BarChart3, label: t.nav.market },
    { to: "/advanced/backtest", icon: FlaskConical, label: "Backtest" },
  ];

  const renderNavItem = (item: typeof coreNavItems[0], dimmed = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary glow-primary"
            : cn(
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                dimmed && "opacity-60"
              )
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {(!collapsed || mobileOpen) && <span className="text-xs">{item.label}</span>}
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-300 z-50",
        "fixed inset-y-0 left-0 md:relative",
        mobileOpen ? "translate-x-0 w-56" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-52"
      )}>
        <div className="flex h-14 md:h-16 items-center gap-2 border-b border-border px-3">
          <img src={lhydbraLogo} alt="LHYDBRA" className="h-8 w-8 md:h-10 md:w-10 shrink-0" />
          {(!collapsed || mobileOpen) && (
            <div className="flex flex-col flex-1">
              <span className="text-sm font-bold text-foreground tracking-[0.15em]">LHYDBRA</span>
              <span className="text-[8px] font-mono text-primary tracking-wider">OPERATOR MODE</span>
            </div>
          )}
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
          {coreNavItems.map((item) => renderNavItem(item))}

          {/* Divider */}
          <div className={cn("my-2", collapsed && !mobileOpen ? "mx-2" : "mx-3")}>
            <div className="h-px bg-border" />
            {(!collapsed || mobileOpen) && (
              <span className="block text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider mt-2 mb-1 px-1">Advanced</span>
            )}
          </div>

          {advancedNavItems.map((item) => renderNavItem(item, true))}
        </nav>

        <div className="hidden md:block border-t border-border p-2">
          <button onClick={() => setCollapsed(!collapsed)} className="flex w-full items-center justify-center rounded-md py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-profit animate-pulse-glow" />
            {(!collapsed || mobileOpen) && <span className="text-[10px] font-mono text-muted-foreground">{t.common.marketOpen}</span>}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between h-12 border-b border-border px-3 md:px-4 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-1 text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">{displayName || user?.email}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <NotificationBell />
            <LanguageSelector collapsed={false} variant="header" />
            <button onClick={signOut} className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-loss border border-border rounded-md hover:bg-accent transition-colors">
              <LogOut className="h-3.5 w-3.5" />
              <span className="font-mono hidden sm:inline">{t.common.logout}</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
