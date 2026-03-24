import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { AgentResult, AgentType } from "@/hooks/useAgentStore";

export const AGENT_ORDER: AgentType[] = [
  "market-analyst",
  "asset-selector",
  "strategy-engine",
  "risk-manager",
  "order-preparator",
  "portfolio-manager",
  "learning-agent",
];

type RunStatus = "queued" | "processing" | "completed" | "failed";

interface AgentRunRow {
  id: string;
  status: RunStatus;
  current_agent: AgentType | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentRunResultRow {
  agent_type: AgentType;
  status: RunStatus;
  content: string;
  error_message: string | null;
  updated_at: string;
  completed_at: string | null;
}

export interface AgentRunSnapshot {
  run: AgentRunRow | null;
  results: Record<string, AgentResult>;
  runningAgent: AgentType | null;
  done: boolean;
  failed: boolean;
}

export async function enqueueAgentRun(requestedAgents: AgentType[], language: string, inputPayload: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Unauthorized");

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      user_id: session.user.id,
      requested_agents: requestedAgents,
      language,
      input_payload: inputPayload,
      status: "queued",
    } as never)
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message || "Failed to queue agent run");
  }

  const placeholderRows = requestedAgents.map((agent) => ({
    run_id: run.id,
    user_id: session.user.id,
    agent_type: agent,
    status: "queued",
    content: "",
  }));

  const { error: resultsError } = await supabase.from("agent_run_results").insert(placeholderRows as never);
  if (resultsError) throw new Error(resultsError.message);

  return run.id;
}

export async function triggerAgentRunProcessing(runId?: string) {
  const { error } = await supabase.functions.invoke("process-agent-runs", {
    body: runId ? { runId } : {},
  });

  if (error) {
    console.error("[AgentRunQueue] Failed to invoke agent run:", error.message);
    toast({
      title: "Agent execution failed",
      description: error.message ?? "Unknown error",
      variant: "destructive",
    });
  }
}

export async function fetchAgentRunSnapshot(runId: string): Promise<AgentRunSnapshot> {
  const [{ data: run, error: runError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id, status, current_agent, error_message, created_at, updated_at")
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("agent_run_results")
      .select("agent_type, status, content, error_message, updated_at, completed_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true }),
  ]);

  if (runError) throw new Error(runError.message);
  if (rowsError) throw new Error(rowsError.message);

  const results: Record<string, AgentResult> = {};
  for (const row of (rows || []) as unknown as AgentRunResultRow[]) {
    results[row.agent_type] = {
      agent: row.agent_type,
      content: row.status === "failed" ? `Error: ${row.error_message || "Unknown error"}` : row.content || "",
      timestamp: row.completed_at || row.updated_at,
      isStreaming: row.status === "processing" || row.status === "queued",
    };
  }

  const typedRun = run as AgentRunRow | null;
  const runningAgent =
    typedRun?.current_agent ||
    ((rows || []) as unknown as AgentRunResultRow[]).find((row) => row.status === "processing" || row.status === "queued")?.agent_type ||
    null;

  return {
    run: typedRun,
    results,
    runningAgent,
    done: typedRun?.status === "completed" || typedRun?.status === "failed",
    failed: typedRun?.status === "failed",
  };
}

export async function getLatestActiveRun() {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id || null;
}
