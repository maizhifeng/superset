import type { ChatAdapter, ChatUser } from "@mui/x-chat-headless";
import type { ChatMessageChunk } from "@mui/x-chat-headless";
import { useAgentStore } from "@/store/agentStore";
import { getAgentModel } from "@/config/aiConfig";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let adapterInstance: PiAgentChatAdapter | null = null;

export function getPiAgentAdapter(userId: string): PiAgentChatAdapter {
  if (!adapterInstance) {
    adapterInstance = new PiAgentChatAdapter(userId);
  }
  return adapterInstance;
}

function avatarDataUrl(label: string, bg = "#1976d2"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="600" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

class PiAgentChatAdapter implements ChatAdapter {
  private userId: string;
  private userAuthor: ChatUser;
  private assistantAuthor: ChatUser;

  constructor(userId: string) {
    this.userId = userId;
    this.userAuthor = {
      id: userId,
      displayName: userId,
      avatarUrl: avatarDataUrl((userId[0] || "U").toUpperCase(), "#1976d2"),
      role: "user",
    };
    this.assistantAuthor = {
      id: "ai-assistant",
      displayName: "AI",
      avatarUrl: avatarDataUrl("A", "#9c27b0"),
      role: "assistant",
    };
  }

  async listConversations() {
    return { conversations: [], hasMore: false };
  }

  async listMessages(input?: { conversationId?: string }) {
    const sid = input?.conversationId;
    if (sid) {
      const state = useAgentStore.getState();
      const session = state.sessions.find((s) => s.id === sid);
      if (session) {
        return {
          messages: session.messages.map((m) => {
            const text =
              m.content.type === "text"
                ? m.content.body
                : m.content.type === "agent_done"
                  ? m.content.summary
                  : m.content.type === "error"
                    ? m.content.message
                    : undefined;
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              parts: m.rawParts && m.rawParts.length > 0
                ? m.rawParts.map((rp: any) => {
                    if (rp.type === "dynamic-tool") {
                      return {
                        type: "dynamic-tool",
                        toolInvocation: {
                          ...rp.toolInvocation,
                          approveTool: async () => {},
                          rejectTool: async () => {},
                        },
                      };
                    }
                    return rp;
                  })
                : text
                  ? [{ type: "text" as const, text }]
                  : [],
              author: m.role === "user" ? this.userAuthor : this.assistantAuthor,
            };
          }),
          hasMore: false,
        };
      }
    }
    return { messages: [], hasMore: false };
  }

  async sendMessage(input: {
    conversationId?: string;
    message: {
      id: string;
      parts: { type: string; text?: string }[];
    };
    signal: AbortSignal;
  }): Promise<ReadableStream<ChatMessageChunk>> {
    const text = input.message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");

    if (!text) {
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    }

    const messageId = uid();
    const storeSessionId = input.conversationId || "session-" + messageId;

    return new ReadableStream({
      start: async (controller) => {
        const reasoningId = uid();
        let hasReasoning = false;
        let reasoningClosed = false;
        let textOpen = false;
        let textId: string | null = null;
        let toolCounter = 0;

        function openText() {
          if (!textOpen) {
            textId = uid();
            textOpen = true;
            controller.enqueue({ type: "text-start", id: textId });
          }
        }

        function closeText() {
          if (textOpen && textId) {
            textOpen = false;
            controller.enqueue({ type: "text-end", id: textId });
            textId = null;
          }
        }

        function closeReasoning() {
          if (hasReasoning && !reasoningClosed) {
            reasoningClosed = true;
            controller.enqueue({ type: "reasoning-end", id: reasoningId });
          }
        }

        const wsUrl =
          import.meta.env.VITE_PI_AGENT_WS_URL || "ws://localhost:9000/agent/ws";

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          const token =
            typeof localStorage !== "undefined"
              ? localStorage.getItem("superset_token")
              : null;
          if (token) {
            ws.send(JSON.stringify({ type: "auth", access_token: token }));
          }
          // restore stored model preference
          const savedModel = getAgentModel();
          if (savedModel) {
            ws.send(JSON.stringify({ type: "set_model", model: savedModel }));
          }
          ws.send(
            JSON.stringify({
              type: "new_session",
              user_id: this.userId,
              storeSessionId: storeSessionId,
            }),
          );
        };

        ws.onmessage = (event: MessageEvent) => {
          if (input.signal.aborted) {
            try {
              controller.enqueue({ type: "abort" as any, messageId });
              controller.close();
              ws.close();
            } catch {}
            return;
          }

          try {
            const msg = JSON.parse(event.data);
            if (!msg || !msg.type) return;

            switch (msg.type) {
              case "session_created":
                ws.send(JSON.stringify({ type: "prompt", message: text, storeSessionId: msg.sessionId }));
                break;

              case "agent_start":
                controller.enqueue({ type: "start", messageId });
                break;

              case "thinking_delta": {
                const delta = (msg as any).delta;
                if (!delta) break;
                if (!hasReasoning) {
                  hasReasoning = true;
                  controller.enqueue({
                    type: "reasoning-start",
                    id: reasoningId,
                  });
                }
                controller.enqueue({
                  type: "reasoning-delta",
                  id: reasoningId,
                  delta,
                });
                break;
              }

              case "message_update": {
                if (
                  (msg as any).assistantMessageEvent?.type === "text_delta"
                ) {
                  const delta = (msg as any).assistantMessageEvent.delta;
                  if (!delta) break;
                  // close reasoning when text starts
                  closeReasoning();
                  openText();
                  controller.enqueue({
                    type: "text-delta",
                    id: textId!,
                    delta,
                  });
                }
                break;
              }

              case "tool_execution_start": {
                // close open text and reasoning before tool call
                closeText();
                closeReasoning();
                toolCounter++;
                const toolCallId = (msg as any).toolCallId || `tool-${toolCounter}`;
                const toolName = (msg as any).toolName || "unknown";
                const args = (msg as any).args || {};
                controller.enqueue({
                  type: "tool-input-start",
                  toolCallId,
                  toolName,
                  dynamic: true,
                });
                const inputJson = JSON.stringify(args);
                if (inputJson) {
                  controller.enqueue({
                    type: "tool-input-delta",
                    toolCallId,
                    inputTextDelta: inputJson,
                  });
                }
                controller.enqueue({
                  type: "tool-input-available",
                  toolCallId,
                  toolName,
                  input: args,
                  dynamic: true,
                } as any);
                break;
              }

              case "tool_execution_end": {
                const toolCallId = (msg as any).toolCallId || `tool-${toolCounter}`;
                const result = (msg as any).result || "";
                controller.enqueue({
                  type: "tool-output-available",
                  toolCallId,
                  output: { result },
                });
                break;
              }

              case "agent_end": {
                closeReasoning();
                if (textOpen) {
                  closeText();
                } else if (hasReasoning && !textOpen) {
                  // only-reasoning fallback
                  const finalText = (msg as any).finalText || "";
                  openText();
                  if (finalText) {
                    controller.enqueue({
                      type: "text-delta",
                      id: textId!,
                      delta: finalText,
                    });
                  }
                  closeText();
                }
                controller.enqueue({ type: "finish", messageId });
                controller.close();
                ws.close();
                break;
              }

              case "error":
                closeReasoning();
                if (textOpen) closeText();
                controller.enqueue({
                  type: "finish",
                  messageId,
                  finishReason: "error",
                });
                controller.close();
                ws.close();
                break;
            }
          } catch {}
        };

        ws.onerror = () => {
          try {
            controller.enqueue({
              type: "finish",
              messageId,
              finishReason: "error",
            });
            controller.close();
          } catch {}
        };

        ws.onclose = () => {
          try {
            controller.close();
          } catch {}
        };

        input.signal.addEventListener("abort", () => {
          ws.close();
        });
      },
    });
  }
}
