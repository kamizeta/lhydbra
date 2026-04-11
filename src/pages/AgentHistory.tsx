import { useEffect, useState } from "react";
import { History, Bot, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";

interface AnalysisRow {
  id: string;
  agent_type: string;
  content: string;
  session_id: string;
  created_at: string;
}

interface Session {
  session_id: string;
  created_at: string;
  analyses: AnalysisRow[];
}

const AGENT_LABELS: Record<string, string> = {
  'market-analyst': 'Market Analyst',
  'asset-selector': 'Asset Selector',
  'strategy-engine': 'Strategy Engine',
  'risk-manager': 'Risk Manager',
  'order-preparator': 'Order Preparator',
  'portfolio-manager': 'Portfolio Manager',
  'learning-agent': 'Learning Agent',
};

export default function AgentHistory() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500) as { data: AnalysisRow[] | null };

    if (data) {
      const grouped: Record<string, AnalysisRow[]> = {};
      for (const row of data) {
        if (!grouped[row.session_id]) grouped[row.session_id] = [];
        grouped[row.session_id].push(row);
      }

      const sessionList: Session[] = Object.entries(grouped)
        .map(([session_id, analyses]) => ({
          session_id,
          created_at: analyses[0].created_at,
          analyses: analyses.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSessions(sessionList);
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [user]);

  const deleteSession = async (sessionId: string) => {
    await supabase.from('agent_analyses').delete().eq('session_id', sessionId);
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.agentHistory.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">
          {sessions.length} {t.agentHistory.sessions}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Bot className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center terminal-border rounded-lg">
          <History className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium text-muted-foreground">{t.agentHistory.noHistory}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t.agentHistory.noHistoryDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.session_id} className="terminal-border rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedSession(expandedSession === session.session_id ? null : session.session_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-foreground">
                        {t.agentHistory.session} — {new Date(session.created_at).toLocaleDateString()}
                      </h3>
                      <StatusBadge variant="profit">
                        {session.analyses.length} {t.agentHistory.agents}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {new Date(session.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(session.session_id); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-loss hover:bg-loss/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {expandedSession === session.session_id
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {expandedSession === session.session_id && (
                <div className="border-t border-border bg-accent/10">
                  {session.analyses.map(analysis => {
                    const key = `${session.session_id}-${analysis.agent_type}`;
                    const isExpanded = expandedAgent === key;
                    return (
                      <div key={analysis.id} className="border-b border-border last:border-b-0">
                        <div
                          className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-accent/20 transition-colors"
                          onClick={() => setExpandedAgent(isExpanded ? null : key)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {AGENT_LABELS[analysis.agent_type] || analysis.agent_type}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {new Date(analysis.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          {isExpanded
                            ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                            : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        {isExpanded && (
                          <div className="px-6 pb-4">
                            <div className="prose prose-sm prose-invert max-w-none
                              prose-headings:text-foreground prose-headings:font-bold
                              prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                              prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-sm
                              prose-strong:text-foreground
                              prose-li:text-muted-foreground prose-li:text-sm
                              prose-code:text-primary prose-code:bg-primary/10 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs
                              prose-table:text-sm
                              prose-th:text-foreground prose-th:font-bold prose-th:border-border prose-th:border prose-th:px-3 prose-th:py-1.5 prose-th:bg-muted
                              prose-td:text-muted-foreground prose-td:border-border prose-td:border prose-td:px-3 prose-td:py-1.5
                            ">
                              <ReactMarkdown>{analysis.content}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
