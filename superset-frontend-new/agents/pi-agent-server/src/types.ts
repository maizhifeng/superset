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

export type ServerMessage =
  | { type: "session_created"; sessionId: string; storeSessionId?: string }
  | { type: "agent_start"; storeSessionId?: string }
  | {
      type: "message_update";
      storeSessionId?: string;
      assistantMessageEvent: { type: "text_delta"; delta: string };
    }
  | { type: "thinking_delta"; storeSessionId?: string; delta: string }
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
      messages: unknown[];
      finalText?: string;
    }
  | { type: "model_list"; models: ModelInfo[]; current?: string }
  | { type: "error"; message: string; retryable: boolean };
