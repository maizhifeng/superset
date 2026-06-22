import { useState, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface ThinkingBoxProps {
  content: string;
  done?: boolean;
}

export default function ThinkingBox({ content, done }: ThinkingBoxProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) {
      setCollapsed(true);
    }
  }, [done]);

  useEffect(() => {
    if (!done && content) {
      setCollapsed(false);
    }
  }, [content]);

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, collapsed]);

  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: 2,
        maxWidth: "90%",
        bgcolor: "grey.50",
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Box
        onClick={() => setCollapsed(!collapsed)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          pt: 1,
          pb: 0.5,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", flex: 1 }}>
          🤔 思考中…
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "none" }}>
          ▼
        </Typography>
      </Box>
      {!collapsed && (
        <Box
          ref={scrollRef}
          sx={{
            maxHeight: 120,
            overflow: "auto",
            px: 1.5,
            pb: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {content}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
