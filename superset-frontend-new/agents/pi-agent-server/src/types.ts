/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

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
      storeSessionId: string;
      dataset_id?: number;
    }
  | { type: "select_session"; storeSessionId: string }
  | {
      type: "prompt";
      message: string;
      storeSessionId?: string;
    }
  | {
      type: "insight";
      storeSessionId: string;
      chartId?: number;
      filters?: Record<string, unknown>;
      prompt?: string;
    }
  | { type: "set_model"; model: string }
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
