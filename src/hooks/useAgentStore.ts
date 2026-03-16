import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  language: string;
  setLanguage: (lang: string) => void;
  _setRunning: (agent: AgentType | null) => void;
  _updateResult: (agent: AgentType, result: Partial<AgentResult>) => void;
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

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;

async function parseAndSaveSignals(orderOutput: string, language: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-trade-signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ orderPreparatorOutput: orderOutput, language }),
    });

    if (resp.ok) {
      const result = await resp.json();
      if (result.count > 0) {
        toast({ title: `✅ ${result.count} trade signals saved`, description: 'Check Trade Ideas page' });
      }
    }
  } catch (e) {
    console.error('Failed to parse trade signals:', e);
  }
}

async function saveAnalysisToDB(agent: AgentType, content: string, sessionId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from('agent_analyses').insert({
      user_id: session.user.id,
      agent_type: agent,
      content,
      session_id: sessionId,
    } as any);
  } catch (e) {
    console.error('Failed to save agent analysis:', e);
  }
}

async function streamAgent(
  agent: AgentType,
  language: string,
  marketData: unknown,
  portfolioData: unknown,
  tradeHistory: unknown,
  onChunk: (fullContent: string) => void,
  marketFeatures?: unknown,
  opportunityScores?: unknown,
  strategyPerformance?: unknown,
): Promise<string> {
  const resp = await fetch(AGENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ agent, marketData, portfolioData, tradeHistory, language, marketFeatures, opportunityScores, strategyPerformance }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errData.error || `HTTP ${resp.status}`);
  }
  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') break;

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          fullContent += content;
          onChunk(fullContent);
        }
      } catch {
        textBuffer = line + '\n' + textBuffer;
        break;
      }
    }
  }

  // Final flush
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          fullContent += content;
          onChunk(fullContent);
        }
      } catch { /* ignore */ }
    }
  }

  return fullContent;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  results: {},
  runningAgent: null,
  sessionId: null,
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

  runAgent: async (agent, marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance) => {
    const { language } = get();
    let sessionId = get().sessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      set({ sessionId });
    }

    set((state) => ({
      runningAgent: agent,
      results: {
        ...state.results,
        [agent]: { agent, content: '', timestamp: new Date().toISOString(), isStreaming: true },
      },
    }));

    try {
      const fullContent = await streamAgent(
        agent,
        language,
        marketData,
        portfolioData,
        tradeHistory,
        (content) => {
          set((state) => ({
            results: {
              ...state.results,
              [agent]: { ...state.results[agent], content },
            },
          }));
        },
        marketFeatures,
        opportunityScores,
        strategyPerformance,
      );

      set((state) => ({
        runningAgent: null,
        results: {
          ...state.results,
          [agent]: { ...state.results[agent], content: fullContent, isStreaming: false },
        },
      }));

      // Save to DB
      if (fullContent && !fullContent.startsWith('Error')) {
        saveAnalysisToDB(agent, fullContent, sessionId);
      }

      // Parse trade signals from order-preparator
      if (agent === 'order-preparator' && fullContent && !fullContent.startsWith('Error')) {
        parseAndSaveSignals(fullContent, language);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: `Agent Error: ${agent}`, description: message, variant: 'destructive' });
      set((state) => ({
        runningAgent: null,
        results: {
          ...state.results,
          [agent]: { ...state.results[agent], content: `Error: ${message}`, isStreaming: false },
        },
      }));
    }
  },

  runAllAgents: async (marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance) => {
    // New session for full run
    const sessionId = crypto.randomUUID();
    set({ sessionId });

    const agentOrder: AgentType[] = [
      'market-analyst',
      'asset-selector',
      'strategy-engine',
      'risk-manager',
      'order-preparator',
      'portfolio-manager',
      'learning-agent',
    ];

    for (const agent of agentOrder) {
      await get().runAgent(agent, marketData, portfolioData, tradeHistory, marketFeatures, opportunityScores, strategyPerformance);
      await new Promise((r) => setTimeout(r, 1500));
    }
  },
}));
