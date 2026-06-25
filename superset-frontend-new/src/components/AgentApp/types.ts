export type AppMode = "traditional" | "agent";

export type StepType =
  | "query"
  | "analyze"
  | "chart"
  | "report"
  | "drilldown"
  | "compare"
  | "schema";
export type StepStatus = "pending" | "running" | "done" | "error";

export interface AgentStep {
  id: string;
  type: StepType;
  status: StepStatus;
  description: string;
  args?: Record<string, unknown>;
  result?: string;
  subSteps?: AgentStep[];
  timestamp: number;
  duration?: number;
}

export type AgentMessageContent =
  | { type: "text"; body: string }
  | { type: "chart"; chartId: number; title: string }
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { type: "sql"; sql: string }
  | { type: "error"; message: string; retryable: boolean }
  | { type: "agent_step"; step: AgentStep }
  | { type: "agent_done"; steps: AgentStep[]; summary: string };

export interface AgentConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: AgentMessageContent;
  timestamp: number;
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  messages: AgentConversationMessage[];
  steps: AgentStep[];
  summary?: string;
}
