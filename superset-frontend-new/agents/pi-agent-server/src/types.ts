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
}

export type ClientMessage =
  | { type: "new_session"; user_id: string; storeSessionId: string }
  | { type: "select_session"; storeSessionId: string }
  | { type: "prompt"; message: string; storeSessionId?: string }
  | { type: "set_model"; model: string }
  | { type: "abort" }
  | { type: "delete_session" };

export interface ModelInfo {
  id: string;
  name?: string;
}

export type ServerMessage =
  | { type: "session_created"; sessionId: string }
  | { type: "agent_start" }
  | { type: "message_update"; assistantMessageEvent: { type: "text_delta"; delta: string } }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: ToolCallArg }
  | { type: "tool_execution_update"; toolCallId: string; partialResult: string }
  | { type: "tool_execution_end"; toolCallId: string; result: string }
  | { type: "agent_end"; messages: unknown[]; finalText?: string }
  | { type: "model_list"; models: ModelInfo[] }
  | { type: "error"; message: string; retryable: boolean };
