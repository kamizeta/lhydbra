import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Shield,
  Bot,
  Lightbulb,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Activity,
  Settings,
  Briefcase,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import LanguageSelector from "@/components/LanguageSelector";
import lhydbraLogo from "@/assets/lhydbra-logo.png";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useI18n();
  const { user, signOut } = useAuth();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t.nav.dashboard },
    { to: "/market", icon: BarChart3, label: t.nav.market },
    { to: "/positions", icon: Briefcase, label: t.dashboard.openPositions },
    { to: "/strategies", icon: Brain, label: t.nav.strategies },
    { to: "/risk", icon: Shield, label: t.nav.risk },
    { to: "/agents", icon: Bot, label: t.nav.agents },
    { to: "/trade-ideas", icon: Lightbulb, label: t.nav.tradeIdeas },
    { to: "/journal", icon: BookOpen, label: t.nav.journal },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-3">
          <img src={lhydbraLogo} alt="LHYDBRA" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground tracking-[0.2em]">LHYDBRA</span>
              <span className="text-[9px] font-mono text-terminal-gold tracking-wider">BALANCED INTELLIGENCE</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary glow-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-md py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Status bar */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-profit animate-pulse-glow" />
            {!collapsed && (
              <span className="text-[10px] font-mono text-muted-foreground">{t.common.marketOpen}</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between h-12 border-b border-border px-4 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              {user?.email}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector collapsed={false} variant="header" />
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-loss border border-border rounded-md hover:bg-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="font-mono">Logout</span>
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
