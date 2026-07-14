import type { ChartData, DashboardFilterValue } from "@/types/api";

export type {
  MessageContent,
  ConversationMessage,
  ConversationThread,
  DrillDownSuggestion,
  KnowledgeCard,
  InsightState,
} from "@/types/ai";

export interface AiDrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: "assistant" | "insight";
  chartId?: number | null;
  chartMeta?: ChartData;
  filters?: Record<string, DashboardFilterValue>;
}
