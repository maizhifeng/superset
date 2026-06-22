import { useState, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

interface ModelOption {
  id: string;
  name?: string;
}

interface ModelSelectorProps {
  current: string;
  models: ModelOption[];
  onSelect: (id: string) => void;
  compact?: boolean;
}

export default function ModelSelector({ current, models, onSelect, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active = models.find((m) => m.id === current);
  const displayName = active?.name || active?.id || current;
  const displayLabel = compact ? displayName : displayName;

  return (
    <Box ref={ref} sx={{ position: "relative", display: "inline-flex" }}>
      <Tooltip title="切换模型" placement="top">
        <Box
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.4,
            px: 0.6,
            py: 0.2,
            borderRadius: 0.75,
            cursor: "pointer",
            fontSize: "0.68rem",
            lineHeight: 1.3,
            color: "primary.main",
            bgcolor: "rgba(0, 122, 115, 0.08)",
            border: "1px solid",
            borderColor: "rgba(0, 122, 115, 0.2)",
            userSelect: "none",
            transition: "all 0.12s",
            "&:hover": {
              bgcolor: "rgba(0, 122, 115, 0.12)",
              borderColor: "rgba(0, 122, 115, 0.35)",
            },
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: "0.68rem",
              fontWeight: 500,
            whiteSpace: "nowrap",
            }}
          >
            {displayLabel}
          </Typography>
          <Box
            component="span"
            sx={{
              width: 0,
              height: 0,
              borderLeft: "3px solid transparent",
              borderRight: "3px solid transparent",
              borderTop: "3.5px solid",
              borderTopColor: "primary.main",
              transition: "transform 0.15s",
              transform: open ? "rotate(180deg)" : "none",
              flexShrink: 0,
            }}
          />
        </Box>
      </Tooltip>
      {open && (
        <Box
          sx={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            mb: 0.5,
            minWidth: 160,
            maxHeight: 300,
            overflow: "auto",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 1300,
          }}
        >
          {models.map((m) => (
            <Box
              key={m.id}
              onClick={() => { onSelect(m.id); setOpen(false); }}
              sx={{
                px: 1.5,
                py: 0.75,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                bgcolor: m.id === current ? "rgba(0, 122, 115, 0.08)" : "transparent",
                borderLeft: m.id === current ? "3px solid" : "3px solid transparent",
                borderColor: m.id === current ? "primary.main" : "transparent",
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: m.id === current ? 600 : 400,
                  color: m.id === current ? "primary.main" : "text.primary",
                  lineHeight: 1.3,
                }}
              >
                {m.name || m.id}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>
                {m.id}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
