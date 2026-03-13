import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import MarketExplorer from "@/pages/MarketExplorer";
import Strategies from "@/pages/Strategies";
import RiskManagement from "@/pages/RiskManagement";
import AgentsPanel from "@/pages/AgentsPanel";
import TradeIdeas from "@/pages/TradeIdeas";
import Journal from "@/pages/Journal";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/market" element={<MarketExplorer />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/risk" element={<RiskManagement />} />
            <Route path="/agents" element={<AgentsPanel />} />
            <Route path="/trade-ideas" element={<TradeIdeas />} />
            <Route path="/journal" element={<Journal />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
