import type { ReactNode } from "react";
import type { DrillDownQuery } from "@/api/drillDown";
import type { ChartData, DashboardFilterValue } from "@/types/api";

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

export interface AiDrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: "assistant" | "insight";
  chartId?: number | null;
  chartMeta?: ChartData;
  filters?: Record<string, DashboardFilterValue>;
}

export interface InsightState {
  loading: boolean;
  error: string | null;
  insightText: string;
  reasoningText: string;
  generate: (chartId: number, filters: Record<string, DashboardFilterValue>) => void;
  clear: () => void;
  stop: () => void;
  sendMessage: (text: string) => void;
}
