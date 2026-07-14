import type { ReactNode } from "react";
import type { DrillDownQuery } from "@/api/drillDown";

export type MessageContent =
  | { type: "text"; body: string }
  | { type: "chart"; chartId: number; title: string }
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { type: "sql"; sql: string }
  | { type: "error"; message: string; retryable: boolean };

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: MessageContent;
  timestamp: number;
}

export interface ConversationThread {
  id: string;
  title: string;
  createdAt: number;
  messages: ConversationMessage[];
  context?: {
    dashboardId?: number;
    chartId?: number;
  };
}

export interface DrillDownSuggestion {
  id: string;
  label: string;
  prompt: string;
  query?: DrillDownQuery;
  loading?: boolean;
  analyzed?: boolean;
}

export type KnowledgeCard =
  | { kind: "prompt"; title: string; description: string; icon: ReactNode; prompt: string }
  | { kind: "doc"; title: string; description: string; icon: ReactNode; docKey: string };

export interface InsightState {
  loading: boolean;
  error: string | null;
  insightText: string;
  reasoningText: string;
  generate: (chartId: number, filters: Record<string, unknown>) => void;
  clear: () => void;
  stop: () => void;
  sendMessage: (text: string) => void;
}

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
  | MessageContent
  | { type: "agent_step"; step: AgentStep }
  | { type: "agent_done"; steps: AgentStep[]; summary: string };

export interface AgentConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: AgentMessageContent;
  rawParts?: Record<string, unknown>[];
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
