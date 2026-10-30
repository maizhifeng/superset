import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import { useNotificationStore } from "@/store/notificationStore";

interface SqlPreviewProps {
  sql: string;
  emptyHint?: string;
  /** Superset engine name shown as a small dialect badge in the header. */
  dialect?: string;
}

/** Engine name reduced to a compact badge label (``postgresql+psycopg2`` → ``POSTGRESQL``). */
function dialectLabel(dialect?: string): string {
  const value = (dialect ?? "").trim().split(/[+/:_]/)[0];
  return value ? value.toUpperCase() : "";
}

/**
 * 可视组装器右侧的 SQL 面板：常显生成的 SQL，仅提供复制操作
 * （面板本身即 SQL 展示区，不再需要展开/折叠切换按钮）。
 *
 * 面板撑满右侧列高度，SQL 内容区自身滚动，因此长 SQL 只会滚动卡片内部，
 * 不会把卡片或页面继续撑高。
 */
export default function SqlPreview({
  sql,
  emptyHint,
  dialect,
}: SqlPreviewProps) {
  const notify = useNotificationStore((s) => s.notify);
  const backendLabel = dialectLabel(dialect);

  const copy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制生成的 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          flexShrink: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "surface.variant",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            color: "text.secondary",
            minWidth: 0,
          }}
        >
          <CodeIcon sx={{ fontSize: 16, flexShrink: 0 }} />
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
          >
            生成的 SQL
          </Typography>
        </Box>
        {backendLabel && (
          <Chip
            size="small"
            label={backendLabel}
            aria-label={`SQL 方言：${backendLabel}`}
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              height: 18,
              borderRadius: 1,
              bgcolor: "bg.muted",
              color: "text.secondary",
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => void copy()}
          disabled={!sql}
          sx={{ textTransform: "none", flexShrink: 0 }}
        >
          复制
        </Button>
      </Box>
      {sql ? (
        <Box
          component="pre"
          sx={{
            flex: 1,
            minHeight: 0,
            m: 0,
            px: 2,
            py: 1.5,
            fontFamily:
              "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', 'Menlo', monospace",
            fontSize: "0.75rem",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "auto",
            maxHeight: { xs: 320, md: "none" },
          }}
        >
          {sql}
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            px: 2,
            py: 3,
            textAlign: "center",
            color: "text.disabled",
          }}
        >
          <CodeIcon sx={{ fontSize: 28, opacity: 0.35 }} />
          {emptyHint && (
            <Typography variant="caption" color="text.disabled">
              {emptyHint}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}
