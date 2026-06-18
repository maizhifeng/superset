import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppMode,
  AgentSession,
  AgentStep,
  AgentConversationMessage,
} from "@/components/AgentApp/types";

const MAX_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 100;

function generateId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateMsgId(): string {
  return `amsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface AgentStoreState {
  mode: AppMode;
  sessions: AgentSession[];
  activeSessionId: string | null;

  switchMode: (mode: AppMode) => void;
  createSession: () => string;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  getActiveSession: () => AgentSession | undefined;
  addStep: (sessionId: string, step: AgentStep) => void;
  updateStep: (
    sessionId: string,
    stepId: string,
    updates: Partial<AgentStep>,
  ) => void;
  addMessage: (
    sessionId: string,
    role: "user" | "assistant",
    content: AgentConversationMessage["content"],
  ) => void;
  setSessionSummary: (sessionId: string, summary: string) => void;
}

export const useAgentStore = create<AgentStoreState>()(
  persist(
    (set, get) => ({
      mode: "traditional",
      sessions: [],
      activeSessionId: null,

      switchMode: (mode) => set({ mode }),

      createSession: () => {
        const id = generateId();
        const session: AgentSession = {
          id,
          title: `对话 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
          createdAt: Date.now(),
          messages: [],
          steps: [],
        };
        set((state) => {
          const sessions = [session, ...state.sessions].slice(0, MAX_SESSIONS);
          return { sessions, activeSessionId: id };
        });
        return id;
      },

      deleteSession: (id) => {
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== id);
          const activeSessionId =
            state.activeSessionId === id
              ? (sessions[0]?.id ?? null)
              : state.activeSessionId;
          return { sessions, activeSessionId };
        });
      },

      switchSession: (id) => set({ activeSessionId: id }),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },

      addStep: (sessionId, step) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return { ...s, steps: [...s.steps, step] };
          });
          return { sessions };
        });
      },

      updateStep: (sessionId, stepId, updates) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const steps = s.steps.map((st) =>
              st.id === stepId ? { ...st, ...updates } : st,
            );
            return { ...s, steps };
          });
          return { sessions };
        });
      },

      addMessage: (sessionId, role, content) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const msg: AgentConversationMessage = {
              id: generateMsgId(),
              role,
              content,
              timestamp: Date.now(),
            };
            const messages = [...s.messages, msg].slice(
              -MAX_MESSAGES_PER_SESSION,
            );
            const title =
              s.messages.length === 0 &&
              role === "user" &&
              content.type === "text"
                ? content.body.slice(0, 60)
                : s.title;
            return { ...s, messages, title };
          });
          return { sessions };
        });
      },

      setSessionSummary: (sessionId, summary) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return { ...s, summary };
          });
          return { sessions };
        });
      },
    }),
    {
      name: "superset-agent-sessions",
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);
