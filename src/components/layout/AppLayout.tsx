import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, Bot, Lightbulb, Briefcase,
  ChevronLeft, ChevronRight, Activity, Settings, LogOut, Menu, X,
  Zap, FlaskConical, Brain, PieChart, ChevronDown, ChevronUp,
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
  const [proOpen, setProOpen] = useState(true);
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

  const mainNavItems = [
    { to: "/", icon: LayoutDashboard, label: t.nav.dashboard },
    { to: "/market", icon: BarChart3, label: t.nav.market },
    { to: "/portfolio", icon: Briefcase, label: "Portafolio" },
    { to: "/agents", icon: Bot, label: t.nav.agents },
    { to: "/trade-ideas", icon: Lightbulb, label: t.nav.tradeIdeas },
    { to: "/learning", icon: Brain, label: "Learning" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const proNavItems = [
    { to: "/signals", icon: Zap, label: "Signals" },
    { to: "/allocation", icon: PieChart, label: "Allocation" },
    { to: "/strategy-lab", icon: FlaskConical, label: "Strategy Lab" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-300 z-50",
        // Mobile: fixed overlay drawer
        "fixed inset-y-0 left-0 md:relative",
        mobileOpen ? "translate-x-0 w-56" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-56"
      )}>
        <div className="flex h-14 md:h-20 items-center gap-3 border-b border-border px-3">
          <img src={lhydbraLogo} alt="LHYDBRA" className="h-10 w-10 md:h-16 md:w-16 shrink-0" />
          {(!collapsed || mobileOpen) && (
            <div className="flex flex-col flex-1">
              <span className="text-sm font-bold text-foreground tracking-[0.2em]">LHYDBRA</span>
              <span className="text-[9px] font-mono text-terminal-gold tracking-wider">BALANCED INTELLIGENCE</span>
            </div>
          )}
          {/* Close button on mobile */}
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary glow-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* LHYDRA PRO v3 collapsible section */}
        <div className="border-t border-border">
          <button
            onClick={() => collapsed ? null : setProOpen(!proOpen)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors",
              "text-terminal-gold hover:bg-sidebar-accent",
              collapsed && !mobileOpen && "justify-center"
            )}
          >
            <Zap className="h-3 w-3 shrink-0 text-terminal-gold" />
            {(!collapsed || mobileOpen) && (
              <>
                <span className="flex-1 text-left">LHYDRA PRO v3</span>
                {proOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </>
            )}
          </button>
          {(proOpen || (collapsed && !mobileOpen)) && (
            <div className="space-y-1 px-2 pb-2">
              {proNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary glow-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {(!collapsed || mobileOpen) && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
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
            {/* Mobile hamburger */}
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
              <span className="font-mono hidden sm:inline">Logout</span>
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
