import { useCallback, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import SmartInput from "@/components/AiDrawer/SmartInput";
import AgentWelcome from "@/components/AgentApp/AgentWelcome";
import AgentStepCard from "@/components/AgentApp/AgentStepCard";
import AgentStepsPanel from "@/components/AgentApp/AgentStepsPanel";
import { useAgentStore } from "@/store/agentStore";
import type { AgentConversationMessage } from "@/components/AgentApp/types";
import { useAgent } from "@/hooks/useAgent";

export default function AgentChat() {
  const agent = useAgent();
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const createSession = useAgentStore((s) => s.createSession);
  const switchSession = useAgentStore((s) => s.switchSession);
  const addMessage = useAgentStore((s) => s.addMessage);
  const setSessionSummary = useAgentStore((s) => s.setSessionSummary);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, agent.steps]);

  const handleSend = useCallback(
    async (text: string) => {
      const store = useAgentStore.getState();
      let sessionId = store.activeSessionId;
      if (!sessionId) {
        sessionId = store.createSession();
      }

      addMessage(sessionId, "user", { type: "text", body: text });
      await agent.execute(text, sessionId);
      addMessage(sessionId, "assistant", {
        type: "agent_done",
        steps: agent.steps,
        summary: agent.finalResult,
      });
      setSessionSummary(sessionId, agent.finalResult.slice(0, 200));
    },
    [agent, addMessage, setSessionSummary],
  );

  const handleSelectIntent = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend],
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
    },
    [switchSession],
  );

  const renderMessage = (msg: AgentConversationMessage) => {
    const content = msg.content;

    switch (content.type) {
      case "text":
        return (
          <Box key={msg.id} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 0.5, display: "block" }}
            >
              {msg.role === "user" ? "你" : "AI"}
            </Typography>
            <Box
              sx={{
                bgcolor: msg.role === "user" ? "primary.main" : "grey.100",
                color: msg.role === "user" ? "white" : "text.primary",
                borderRadius: 2,
                px: 2,
                py: 1.5,
                maxWidth: "80%",
                ml: msg.role === "user" ? "auto" : 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {content.body}
            </Box>
          </Box>
        );

      case "agent_step":
        return (
          <Box key={msg.id} sx={{ mb: 1 }}>
            <AgentStepCard step={content.step} />
          </Box>
        );

      case "agent_done":
        return (
          <Box key={msg.id} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 0.5, display: "block" }}
            >
              AI
            </Typography>
            <Box
              sx={{
                bgcolor: "grey.100",
                borderRadius: 2,
                px: 2,
                py: 1.5,
                maxWidth: "90%",
                whiteSpace: "pre-wrap",
              }}
            >
              {content.summary || "分析完成"}
            </Box>
          </Box>
        );

      case "error":
        return (
          <Box key={msg.id} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 0.5, display: "block" }}
            >
              AI
            </Typography>
            <Box
              sx={{
                bgcolor: "error.light",
                color: "error.contrastText",
                borderRadius: 2,
                px: 2,
                py: 1.5,
                maxWidth: "80%",
              }}
            >
              {content.message}
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  if (!activeSession || activeSession.messages.length === 0) {
    return (
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <AgentWelcome
            onSelectIntent={handleSelectIntent}
            recentSessions={sessions.filter((s) => s.messages.length > 0)}
            onSelectSession={handleSelectSession}
          />
        </Box>
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <SmartInput
            onSend={handleSend}
            onStop={agent.stop}
            streaming={agent.isRunning}
            disabled={agent.isRunning}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        minHeight: 0,
      }}
    >
      <AgentStepsPanel steps={agent.steps} isRunning={agent.isRunning} />

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {activeSession.messages.map(renderMessage)}
        {agent.isRunning &&
          agent.steps.map((step) => (
            <Box key={step.id} sx={{ mb: 1 }}>
              <AgentStepCard step={step} />
            </Box>
          ))}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <SmartInput
          onSend={handleSend}
          onStop={agent.stop}
          streaming={agent.isRunning}
          disabled={agent.isRunning}
        />
      </Box>
    </Box>
  );
}
