import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ConversationThread,
  ConversationMessage,
} from "@/components/AiDrawer/types";

const MAX_THREADS = 20;
const MAX_MESSAGES_PER_THREAD = 100;

function generateId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateMsgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface ConversationState {
  threads: ConversationThread[];
  activeThreadId: string | null;

  createThread: (context?: ConversationThread["context"]) => string;
  deleteThread: (id: string) => void;
  switchThread: (id: string) => void;
  addMessage: (
    threadId: string,
    role: "user" | "assistant",
    content: ConversationMessage["content"],
  ) => void;
  getActiveThread: () => ConversationThread | undefined;
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,

      createThread: (context) => {
        const id = generateId();
        const thread: ConversationThread = {
          id,
          title: `对话 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
          createdAt: Date.now(),
          messages: [],
          context,
        };
        set((state) => {
          const threads = [thread, ...state.threads].slice(0, MAX_THREADS);
          return { threads, activeThreadId: id };
        });
        return id;
      },

      deleteThread: (id) => {
        set((state) => {
          const threads = state.threads.filter((t) => t.id !== id);
          const activeThreadId =
            state.activeThreadId === id
              ? (threads[0]?.id ?? null)
              : state.activeThreadId;
          return { threads, activeThreadId };
        });
      },

      switchThread: (id) => {
        set({ activeThreadId: id });
      },

      addMessage: (threadId, role, content) => {
        set((state) => {
          const threads = state.threads.map((t) => {
            if (t.id !== threadId) return t;
            const msg: ConversationMessage = {
              id: generateMsgId(),
              role,
              content,
              timestamp: Date.now(),
            };
            const messages = [...t.messages, msg].slice(
              -MAX_MESSAGES_PER_THREAD,
            );
            const title =
              t.messages.length === 0 &&
              role === "user" &&
              content.type === "text"
                ? content.body.slice(0, 60)
                : t.title;
            return { ...t, messages, title };
          });
          return { threads };
        });
      },

      getActiveThread: () => {
        const { threads, activeThreadId } = get();
        return threads.find((t) => t.id === activeThreadId);
      },
    }),
    {
      name: "superset-conversations",
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
    },
  ),
);
