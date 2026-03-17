import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import MarketPage from "@/pages/MarketPage";
import AgentsPanel from "@/pages/AgentsPanel";
import TradeIdeas from "@/pages/TradeIdeas";
import PortfolioPage from "@/pages/PortfolioPage";
import SettingsPage from "@/pages/SettingsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFound from "@/pages/NotFound";
import ApiUsagePage from "@/pages/ApiUsagePage";
import SignalCenter from "@/pages/SignalCenter";
import StrategyResearchLab from "@/pages/StrategyResearchLab";
import LearningDashboard from "@/pages/LearningDashboard";
import PortfolioAllocation from "@/pages/PortfolioAllocation";

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
        <Route path="/market" element={<MarketPage />} />
        <Route path="/agents" element={<AgentsPanel />} />
        <Route path="/trade-ideas" element={<TradeIdeas />} />
        <Route path="/signals" element={<SignalCenter />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/allocation" element={<PortfolioAllocation />} />
        <Route path="/strategy-lab" element={<StrategyResearchLab />} />
        <Route path="/learning" element={<LearningDashboard />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/api-usage" element={<ApiUsagePage />} />
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
