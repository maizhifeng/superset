export interface ToolCallArg {
  columns: string[];
  metrics: string[];
  time_range?: string;
  filters?: Record<string, string | number>;
  orderby?: [string, boolean][];
  row_limit?: number;
}

export interface Session {
  id: string;
  userId: string;
  state: "idle" | "running";
  datasetId?: number;
}

export type ClientMessage =
  | { type: "auth"; access_token: string }
  | {
      type: "new_session";
      user_id: string;
      storeSessionId: string;
      dataset_id?: number;
    }
  | { type: "select_session"; storeSessionId: string }
  | {
      type: "prompt";
      message: string;
      storeSessionId?: string;
      user_id?: string;
    }
  | {
      type: "insight";
      storeSessionId: string;
      chartId?: number;
      filters?: Record<string, unknown>;
      prompt?: string;
    }
  | { type: "set_model"; model: string; user_id?: string }
  | { type: "abort"; storeSessionId?: string }
  | { type: "delete_session"; storeSessionId: string };

export interface ModelInfo {
  id: string;
  name?: string;
}

export interface AgentWebSocketMeta {
  preferredModel?: string;
}

/** Events for chart-insight requests (insight: true). */
export type InsightServerMessage =
  | { type: "agent_start"; storeSessionId: string; insight: true }
  | {
      type: "message_update";
      storeSessionId: string;
      insight: true;
      assistantMessageEvent: { type: "text_delta"; delta: string };
    }
  | {
      type: "thinking_delta";
      storeSessionId: string;
      insight: true;
      delta: string;
    }
  | {
      type: "agent_end";
      storeSessionId: string;
      insight: true;
      messages: unknown[];
      finalText?: string;
    }
  | {
      type: "error";
      storeSessionId: string;
      insight: true;
      message: string;
      retryable: boolean;
    };

export type ServerMessage =
  | { type: "session_created"; sessionId: string; storeSessionId?: string }
  | { type: "agent_start"; storeSessionId?: string; insight?: boolean }
  | {
      type: "message_update";
      storeSessionId?: string;
      insight?: boolean;
      assistantMessageEvent: { type: "text_delta"; delta: string };
    }
  | {
      type: "thinking_delta";
      storeSessionId?: string;
      insight?: boolean;
      delta: string;
    }
  | {
      type: "tool_execution_start";
      storeSessionId?: string;
      toolCallId: string;
      toolName: string;
      args: ToolCallArg;
    }
  | { type: "tool_execution_update"; toolCallId: string; partialResult: string }
  | {
      type: "tool_execution_end";
      storeSessionId?: string;
      toolCallId: string;
      toolName: string;
      result: string;
    }
  | {
      type: "agent_end";
      storeSessionId?: string;
      insight?: boolean;
      messages: unknown[];
      finalText?: string;
    }
  | { type: "model_list"; models: ModelInfo[]; current?: string }
  | {
      type: "error";
      message: string;
      retryable: boolean;
      storeSessionId?: string;
      insight?: boolean;
    };
