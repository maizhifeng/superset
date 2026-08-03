import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import type { KnowledgeCard } from "./types";
import { transitions } from "@/theme/motion";

interface KnowledgeCardsProps {
  cards: KnowledgeCard[];
  onClick: (card: KnowledgeCard) => void;
}

export default function KnowledgeCards({
  cards,
  onClick,
}: KnowledgeCardsProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          px: 0.5,
          mb: 0.5,
        }}
      >
        知识库
      </Typography>
      {cards.map((card) => (
        <Box
          key={card.title}
          onClick={() => onClick(card)}
          sx={{
            display: "flex",
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            transition: transitions.boxShadow,
            "&:hover": {
              boxShadow: "var(--mui-palette-shadow-cardHover)",
              borderColor: "primary.light",
            },
          }}
        >
          <Box
            sx={{
              color: "primary.main",
              display: "flex",
              alignItems: "flex-start",
              pt: 0.25,
            }}
          >
            {card.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
              {card.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {card.description}
            </Typography>
          </Box>
        </Box>
      ))}
      <Box sx={{ textAlign: "center", py: 2, mt: 1 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <SmartToyIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography color="text.disabled" variant="caption">
            或直接输入问题开始对话
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
