import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import ExpandMore from "@mui/icons-material/ExpandMore";
import ContentCopy from "@mui/icons-material/ContentCopy";
import { useNotificationStore } from "@/store/notificationStore";

interface InsightSectionCardProps {
  title: string;
  content: string;
  defaultCollapsed?: boolean;
}

export default function InsightSectionCard({ title, content, defaultCollapsed }: InsightSectionCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const notify = useNotificationStore((s) => s.notify);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`## ${title}\n\n${content}`);
      notify({ severity: "success", message: `${title} 已复制` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 1,
          cursor: "pointer",
          bgcolor: "action.hover",
          userSelect: "none",
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          sx={{ mr: 0.5 }}
        >
          <ContentCopy sx={{ fontSize: 16 }} />
        </IconButton>
        <ExpandMore
          sx={{
            fontSize: 18,
            color: "text.disabled",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}
          >
            {content}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}
