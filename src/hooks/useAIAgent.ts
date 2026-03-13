import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n';

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

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;

export function useAIAgent() {
  const [results, setResults] = useState<Record<AgentType, AgentResult>>({} as Record<AgentType, AgentResult>);
  const [runningAgent, setRunningAgent] = useState<AgentType | null>(null);
  const { language } = useI18n();

  const runAgent = useCallback(async (
    agent: AgentType,
    marketData?: unknown,
    portfolioData?: unknown,
    tradeHistory?: unknown,
  ) => {
    setRunningAgent(agent);
    setResults(prev => ({
      ...prev,
      [agent]: { agent, content: '', timestamp: new Date().toISOString(), isStreaming: true },
    }));

    try {
      const resp = await fetch(AGENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ agent, marketData, portfolioData, tradeHistory, language }),
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
              setResults(prev => ({
                ...prev,
                [agent]: { ...prev[agent], content: fullContent },
              }));
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
              setResults(prev => ({
                ...prev,
                [agent]: { ...prev[agent], content: fullContent },
              }));
            }
          } catch { /* ignore */ }
        }
      }

      setResults(prev => ({
        ...prev,
        [agent]: { ...prev[agent], isStreaming: false },
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: `Agent Error: ${agent}`, description: message, variant: 'destructive' });
      setResults(prev => ({
        ...prev,
        [agent]: { ...prev[agent], content: `Error: ${message}`, isStreaming: false },
      }));
    } finally {
      setRunningAgent(null);
    }
  }, []);

  const runAllAgents = useCallback(async (
    marketData?: unknown,
    portfolioData?: unknown,
    tradeHistory?: unknown,
  ) => {
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
      await runAgent(agent, marketData, portfolioData, tradeHistory);
      // Small delay between agents to avoid rate limits
      await new Promise(r => setTimeout(r, 1500));
    }
  }, [runAgent]);

  return { results, runningAgent, runAgent, runAllAgents };
}
