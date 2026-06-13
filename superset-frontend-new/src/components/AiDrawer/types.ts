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
