import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import FaceIcon from "@mui/icons-material/Face";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import LightMdRenderer from "@/components/LightMdRenderer";
import type { MessageContent } from "@/components/AiDrawer/types";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: MessageContent;
  onRetry?: () => void;
}

export default function MessageBubble({ role, content, onRetry }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const renderContent = () => {
    switch (content.type) {
      case "text":
        return <LightMdRenderer content={content.body} />;
      case "error":
        return (
          <Box>
            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
              {content.message}
            </Typography>
            {content.retryable && onRetry && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={onRetry}
              >
                重试
              </Button>
            )}
          </Box>
        );
      case "chart":
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {content.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              图表 #{content.chartId}
            </Typography>
          </Box>
        );
      case "table":
        return (
          <Table size="small" sx={{ fontSize: "0.75rem" }}>
            <TableHead>
              <TableRow>
                {content.columns.map((col) => (
                  <TableCell key={col} sx={{ fontSize: "0.75rem", fontWeight: 600 }}>
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {content.rows.map((row, i) => (
                <TableRow key={i}>
                  {content.columns.map((col) => (
                    <TableCell key={col} sx={{ fontSize: "0.75rem" }}>
                      {String(row[col] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      case "sql":
        return (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: "grey.900",
              color: "grey.100",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content.sql}
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        justifyContent: isUser ? "flex-end" : "flex-start",
        "&:hover .msg-actions": { opacity: 1 },
      }}
    >
      {!isUser && (
        <SmartToyIcon
          sx={{
            fontSize: 20,
            mt: 0.5,
            color: "primary.main",
            flexShrink: 0,
          }}
        />
      )}
      <Box sx={{ maxWidth: "92%", minWidth: 0 }}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: isUser ? "primary.main" : "background.paper",
            color: isUser ? "primary.contrastText" : "text.primary",
            border: isUser ? "none" : "1px solid",
            borderColor: "divider",
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            wordBreak: "break-word",
            boxShadow: isUser ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {renderContent()}
        </Box>
        {!isUser && content.type !== "error" && (
          <Box
            className="msg-actions"
            sx={{
              display: "flex",
              gap: 0.25,
              mt: 0.25,
              opacity: 0,
              transition: "opacity 150ms",
            }}
          >
            <IconButton
              size="small"
              onClick={() => {
                const text =
                  content.type === "text"
                    ? content.body
                    : content.type === "sql"
                      ? content.sql
                      : "";
                handleCopy(text);
              }}
              sx={{ width: 24, height: 24 }}
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
            {onRetry && (
              <IconButton
                size="small"
                onClick={onRetry}
                sx={{ width: 24, height: 24 }}
              >
                <RefreshIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
        )}
        {copied && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "0.6875rem", ml: 1 }}
          >
            已复制
          </Typography>
        )}
      </Box>
      {isUser && (
        <FaceIcon
          sx={{
            fontSize: 20,
            mt: 0.5,
            color: "text.secondary",
            flexShrink: 0,
          }}
        />
      )}
    </Box>
  );
}
