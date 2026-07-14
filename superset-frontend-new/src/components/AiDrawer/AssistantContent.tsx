import { forwardRef } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import MessageBubble from "@/components/AiDrawer/MessageBubble";
import KnowledgeCards from "./KnowledgeCards";
import StreamingMessage from "./StreamingMessage";
import type { ConversationThread, KnowledgeCard } from "@/types/ai";

interface AssistantContentProps {
  activeThread: ConversationThread | null;
  knowledgeCards: KnowledgeCard[];
  streaming: boolean;
  streamingText: string;
  dataLoading: boolean;
  onCardClick: (card: KnowledgeCard) => void;
  onRetry: () => void;
}

const AssistantContent = forwardRef<HTMLDivElement, AssistantContentProps>(
  function AssistantContent(
    { activeThread, knowledgeCards, streaming, streamingText, dataLoading, onCardClick, onRetry },
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
        {activeThread?.context?.dashboardId && (
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              bgcolor: "action.hover",
              fontSize: "0.75rem",
              color: "text.secondary",
            }}
          >
            仪表板: #{activeThread.context.dashboardId}
          </Box>
        )}

        {(!activeThread || activeThread.messages.length === 0) && !streaming && (
          <KnowledgeCards cards={knowledgeCards} onClick={onCardClick} />
        )}

        {activeThread?.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            onRetry={msg.content.type === "error" ? onRetry : undefined}
          />
        ))}

        {streaming && streamingText && <StreamingMessage text={streamingText} />}

        {dataLoading && !streaming && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pl: 0.5 }}>
            <CircularProgress size={16} sx={{ color: "primary.main" }} />
          </Box>
        )}

        {streaming && !streamingText && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pl: 0.5 }}>
            <SmartToyIcon sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />
            <CircularProgress size={16} sx={{ color: "primary.main" }} />
          </Box>
        )}
      </Box>
    );
  },
);

export default AssistantContent;
