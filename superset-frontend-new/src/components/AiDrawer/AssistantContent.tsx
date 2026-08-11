import { forwardRef } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import MessageBubble from "@/components/AiDrawer/MessageBubble";
import AgentStepCard from "@/components/AiDrawer/AgentStepCard";
import ThinkingBlock from "@/components/AiDrawer/ThinkingBlock";
import KnowledgeCards from "./KnowledgeCards";
import StreamingMessage from "./StreamingMessage";
import type { AgentStep, AgentSession, KnowledgeCard } from "@/types/ai";

interface AssistantContentProps {
  activeSession: AgentSession | null;
  knowledgeCards: KnowledgeCard[];
  streaming: boolean;
  streamingText: string;
  thinking: string;
  thinkingDone: boolean;
  turnSteps: AgentStep[];
  isConnected: boolean;
  onCardClick: (card: KnowledgeCard) => void;
}

const AssistantContent = forwardRef<HTMLDivElement, AssistantContentProps>(
  function AssistantContent(
    {
      activeSession,
      knowledgeCards,
      streaming,
      streamingText,
      thinking,
      thinkingDone,
      turnSteps,
      isConnected,
      onCardClick,
    },
    ref,
  ) {
    return (
      <Box
        ref={ref}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {!isConnected && (
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              bgcolor: "error.light",
              color: "error.contrastText",
              fontSize: "0.75rem",
            }}
          >
            ⚠️ AI Agent 服务未连接，消息可能无法响应
          </Box>
        )}

        {(!activeSession || activeSession.messages.length === 0) &&
          !streaming && (
            <KnowledgeCards cards={knowledgeCards} onClick={onCardClick} />
          )}

        {activeSession?.messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {streaming && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {thinking && (
              <ThinkingBlock text={thinking} done={thinkingDone} />
            )}
            {turnSteps.length > 0 && (
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
              >
                {turnSteps.map((step, i) => (
                  <AgentStepCard
                    key={step.id}
                    step={step}
                    compact
                    isLast={i === turnSteps.length - 1}
                  />
                ))}
              </Box>
            )}
            {streamingText ? (
              <StreamingMessage text={streamingText} />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  pl: 0.5,
                }}
              >
                <SmartToyIcon
                  sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }}
                />
                <CircularProgress size={16} sx={{ color: "primary.main" }} />
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  },
);

export default AssistantContent;
