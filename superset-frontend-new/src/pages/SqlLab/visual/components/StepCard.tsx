import type { ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

interface StepCardProps {
  index: number;
  title: string;
  icon: ReactNode;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * 步骤卡片：折叠为即时切换（不做高度动画），避免大内容折叠时卡顿，
 * 也保证折叠/展开不会引起外部布局抖动。
 */
export default function StepCard({
  index,
  title,
  icon,
  summary,
  expanded,
  onToggle,
  disabled = false,
  children,
}: StepCardProps) {
  const showContent = expanded && !disabled;
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        overflow: "hidden",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Box
        onClick={disabled ? undefined : onToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: disabled ? "default" : "pointer",
          bgcolor: expanded ? "action.hover" : "background.paper",
          "&:hover": disabled ? {} : { bgcolor: "action.hover" },
          userSelect: "none",
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.65rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            color: "text.secondary",
          }}
        >
          {icon}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, flexShrink: 0, fontSize: "0.8125rem" }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {expanded ? "" : (summary ?? "")}
        </Typography>
        {!disabled && (
          <IconButton
            size="small"
            sx={{ p: 0.25 }}
            aria-label={expanded ? "折叠" : "展开"}
          >
            {expanded ? (
              <KeyboardArrowUpIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )}
          </IconButton>
        )}
      </Box>
      {showContent && <Box sx={{ px: 1.5, pb: 1.5, pt: 0.25 }}>{children}</Box>}
    </Paper>
  );
}
