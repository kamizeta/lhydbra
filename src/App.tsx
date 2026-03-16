import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import MarketExplorer from "@/pages/MarketExplorer";
import Strategies from "@/pages/Strategies";
import RiskManagement from "@/pages/RiskManagement";
import AgentsPanel from "@/pages/AgentsPanel";
import AgentHistory from "@/pages/AgentHistory";
import TradeIdeas from "@/pages/TradeIdeas";
import Journal from "@/pages/Journal";
import SettingsPage from "@/pages/SettingsPage";
import PositionsPage from "@/pages/PositionsPage";
import OpportunityRadar from "@/pages/OpportunityRadar";
import StrategyLab from "@/pages/StrategyLab";
import ControlCenter from "@/pages/ControlCenter";
import AlgoEffectiveness from "@/pages/AlgoEffectiveness";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono animate-pulse-glow">LHYDBRA Loading...</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/market" element={<MarketExplorer />} />
        <Route path="/strategies" element={<Strategies />} />
        <Route path="/risk" element={<RiskManagement />} />
        <Route path="/agents" element={<AgentsPanel />} />
        <Route path="/agent-history" element={<AgentHistory />} />
        <Route path="/trade-ideas" element={<TradeIdeas />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/radar" element={<OpportunityRadar />} />
        <Route path="/lab" element={<StrategyLab />} />
        <Route path="/center" element={<ControlCenter />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ProtectedRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
