import { useCallback, useRef, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import SmartInput from "@/components/AiDrawer/SmartInput";
import AgentWelcome from "@/components/AgentApp/AgentWelcome";
import AgentStepCard from "@/components/AgentApp/AgentStepCard";
import AgentStepsPanel from "@/components/AgentApp/AgentStepsPanel";
import { useAgentStore } from "@/store/agentStore";
import type { AgentConversationMessage } from "@/components/AgentApp/types";
import { usePiAgent } from "@/hooks/usePiAgent";
import MarkdownRenderer from "@/components/AgentApp/MarkdownRenderer";
import ThinkingBox from "@/components/AgentApp/ThinkingBox";

export default function AgentChat() {
  const piAgent = usePiAgent();
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const switchSession = useAgentStore((s) => s.switchSession);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 200;
  }, []);

  const handleScroll = useCallback(() => {
    setUserScrolledUp(!isNearBottom());
  }, [isNearBottom]);

  useEffect(() => {
    let sid = activeSessionId;
    if (!sid) {
      const store = useAgentStore.getState();
      sid = store.createSession();
    }
    piAgent.connect(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSession?.messages, piAgent.steps, piAgent.currentText, userScrolledUp]);

  const handleSend = useCallback(
    (text: string) => {
      const store = useAgentStore.getState();
      let sessionId = store.activeSessionId;
      if (!sessionId) {
        sessionId = store.createSession();
        piAgent.connect(sessionId);
      }
      piAgent.sendMessage(text);
    },
    [piAgent],
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
              }}
            >
              {content.summary ? (
                <MarkdownRenderer content={content.summary} />
              ) : (
                "分析完成"
              )}
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
            onStop={piAgent.abort}
            streaming={!!(activeSessionId && piAgent.isSessionRunning(activeSessionId))}
            disabled={!!(activeSessionId && piAgent.isSessionRunning(activeSessionId))}
            currentModel={piAgent.currentModel}
            modelList={piAgent.modelList}
            onModelChange={piAgent.setModel}
          />
        </Box>
      </Box>
    );
  }

  const isActiveRunning = !!(activeSessionId && piAgent.isSessionRunning(activeSessionId));

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
      <AgentStepsPanel steps={piAgent.steps} isRunning={isActiveRunning} />
      <Box ref={scrollContainerRef} onScroll={handleScroll} sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {activeSession.messages.map(renderMessage)}
        {piAgent.isRunning &&
          piAgent.steps.map((step) => (
            <Box key={step.id} sx={{ mb: 1 }}>
              <AgentStepCard step={step} />
            </Box>
          ))}
        {activeSessionId && piAgent.isSessionRunning(activeSessionId) && piAgent.currentThinking && (
          <ThinkingBox content={piAgent.currentThinking} done={piAgent.isThinkingDone} />
        )}
        {activeSessionId && piAgent.isSessionRunning(activeSessionId) && piAgent.currentText && (
          <Box sx={{ mb: 2 }}>
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
              }}
            >
              <MarkdownRenderer content={piAgent.currentText} />
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: 8,
                  height: 16,
                  bgcolor: "primary.main",
                  ml: 0.5,
                  animation: "blink 1s step-end infinite",
                  "@keyframes blink": {
                    "50%": { opacity: 0 },
                  },
                }}
              />
            </Box>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <SmartInput
          onSend={handleSend}
          onStop={piAgent.abort}
          streaming={isActiveRunning}
          disabled={isActiveRunning}
          currentModel={piAgent.currentModel}
          modelList={piAgent.modelList}
          onModelChange={piAgent.setModel}
        />
      </Box>
    </Box>
  );
}
