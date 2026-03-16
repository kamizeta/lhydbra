import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import {
  AGENT_ORDER,
  enqueueAgentRun,
  fetchAgentRunSnapshot,
  getLatestActiveRun,
  triggerAgentRunProcessing,
} from '@/lib/agentRunQueue';

export type AgentType =
  | 'market-analyst'
  | 'asset-selector'
  | 'strategy-engine'
  | 'risk-manager'
  | 'order-preparator'
  | 'portfolio-manager'
  | 'learning-agent';

export interface AgentResult {
  agent: AgentType;
  content: string;
  timestamp: string;
  isStreaming: boolean;
}

interface AgentStore {
  results: Record<string, AgentResult>;
  runningAgent: AgentType | null;
  sessionId: string | null;
  activeRunId: string | null;
  language: string;
  setLanguage: (lang: string) => void;
  _setRunning: (agent: AgentType | null) => void;
  _updateResult: (agent: AgentType, result: Partial<AgentResult>) => void;
  resumeLatestRun: () => Promise<void>;
  runAgent: (
    agent: AgentType,
    marketData?: unknown,
    portfolioData?: unknown,
    tradeHistory?: unknown,
    marketFeatures?: unknown,
    opportunityScores?: unknown,
    strategyPerformance?: unknown,
  ) => Promise<void>;
  runAllAgents: (
    marketData?: unknown,
    portfolioData?: unknown,
    tradeHistory?: unknown,
    marketFeatures?: unknown,
    opportunityScores?: unknown,
    strategyPerformance?: unknown,
  ) => Promise<void>;
}

let pollTimer: number | null = null;

const clearPollTimer = () => {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
};

const createPlaceholderResult = (agent: AgentType): AgentResult => ({
  agent,
  content: '',
  timestamp: new Date().toISOString(),
  isStreaming: true,
});

const pollRunStatus = async (
  runId: string,
  set: (partial: Partial<AgentStore> | ((state: AgentStore) => Partial<AgentStore>)) => void,
  get: () => AgentStore,
) => {
  try {
    const snapshot = await fetchAgentRunSnapshot(runId);
    if (get().activeRunId !== runId) return;

    set((state) => ({
      sessionId: runId,
      runningAgent: snapshot.runningAgent,
      results: {
        ...state.results,
        ...snapshot.results,
      },
    }));

    if (!snapshot.done) {
      pollTimer = window.setTimeout(() => {
        void pollRunStatus(runId, set, get);
      }, 2000);
      return;
    }

    clearPollTimer();
    set({ runningAgent: null, activeRunId: null });

    if (snapshot.failed) {
      toast({
        title: 'La ejecución terminó con errores',
        description: snapshot.run?.error_message || 'Revisa la salida de los agentes.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Agentes completados',
      description: 'La ejecución siguió en segundo plano y ya terminó.',
    });
  } catch (error) {
    clearPollTimer();
    set({ runningAgent: null, activeRunId: null });
    toast({
      title: 'Error al consultar la ejecución',
      description: error instanceof Error ? error.message : 'Unknown error',
      variant: 'destructive',
    });
  }
};

const startRunPolling = (
  runId: string,
  set: (partial: Partial<AgentStore> | ((state: AgentStore) => Partial<AgentStore>)) => void,
  get: () => AgentStore,
) => {
  clearPollTimer();
  set({ activeRunId: runId, sessionId: runId });
  void pollRunStatus(runId, set, get);
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  results: {},
  runningAgent: null,
  sessionId: null,
  activeRunId: null,
  language: 'es',
  setLanguage: (lang) => set({ language: lang }),
  _setRunning: (agent) => set({ runningAgent: agent }),
  _updateResult: (agent, partial) =>
    set((state) => ({
      results: {
        ...state.results,
        [agent]: { ...state.results[agent], ...partial } as AgentResult,
      },
    })),

  resumeLatestRun: async () => {
    try {
      const runId = await getLatestActiveRun();
      if (!runId || get().activeRunId === runId) return;
      startRunPolling(runId, set, get);
    } catch {
      // silent restore failure
    }
  },

  runAgent: async (agent, marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance) => {
    try {
      const { language } = get();
      const inputPayload = {
        marketData,
        portfolioData,
        tradeHistory,
        marketFeatures,
        opportunityScores,
        strategyPerformance,
      };

      set((state) => ({
        runningAgent: agent,
        results: {
          ...state.results,
          [agent]: createPlaceholderResult(agent),
        },
      }));

      const runId = await enqueueAgentRun([agent], language, inputPayload);
      triggerAgentRunProcessing(runId);
      startRunPolling(runId, set, get);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: `Agent Error: ${agent}`, description: message, variant: 'destructive' });
      set((state) => ({
        runningAgent: null,
        activeRunId: null,
        results: {
          ...state.results,
          [agent]: { ...createPlaceholderResult(agent), content: `Error: ${message}`, isStreaming: false },
        },
      }));
    }
  },

  runAllAgents: async (marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance) => {
    try {
      const { language } = get();
      const inputPayload = {
        marketData,
        portfolioData,
        tradeHistory,
        marketFeatures,
        opportunityScores,
        strategyPerformance,
      };

      set((state) => ({
        runningAgent: AGENT_ORDER[0],
        results: {
          ...state.results,
          ...Object.fromEntries(AGENT_ORDER.map((agent) => [agent, createPlaceholderResult(agent)])),
        },
      }));

      const runId = await enqueueAgentRun(AGENT_ORDER, language, inputPayload);
      triggerAgentRunProcessing(runId);
      startRunPolling(runId, set, get);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Agent Error', description: message, variant: 'destructive' });
      set({ runningAgent: null, activeRunId: null });
    }
  },
}));
