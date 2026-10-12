import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import { useNotificationStore } from "@/store/notificationStore";

interface SqlPreviewProps {
  sql: string;
  emptyHint?: string;
}

/**
 * 可视组装器右侧的 SQL 面板：常显生成的 SQL，仅提供复制操作
 * （面板本身即 SQL 展示区，不再需要展开/折叠切换按钮）。
 */
export default function SqlPreview({ sql, emptyHint }: SqlPreviewProps) {
  const notify = useNotificationStore((s) => s.notify);

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
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            color: "text.secondary",
          }}
        >
          <CodeIcon sx={{ fontSize: 16 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            生成的 SQL
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => void copy()}
          disabled={!sql}
          sx={{ textTransform: "none" }}
        >
          复制
        </Button>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          px: 2,
          pb: 1.5,
          fontFamily:
            "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', 'Menlo', monospace",
          fontSize: "0.75rem",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 420,
          overflow: "auto",
        }}
      >
        {sql}
      </Box>
      {!sql && emptyHint && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: "block", px: 2, pb: 1 }}
        >
          {emptyHint}
        </Typography>
      )}
    </Paper>
  );
}
