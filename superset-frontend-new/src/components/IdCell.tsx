import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNotificationStore } from "@/store/notificationStore";

interface IdCellProps {
  id: number | string | null | undefined;
  /** Entity name used in the copy tooltip/toast, e.g. "图表". */
  entity?: string;
}

/**
 * Table cell that shows the real numeric ID plus a copy affordance.
 *
 * Previously several list pages replaced the ID with a bare copy icon, so the
 * column no longer identified rows. The copy action stays secondary.
 */
export default function IdCell({ id, entity = "记录" }: IdCellProps) {
  const notify = useNotificationStore((s) => s.notify);

  if (id === null || id === undefined || id === "") {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(id));
      notify({ severity: "success", message: `已复制${entity} ID：${id}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {id}
      </Typography>
      <Tooltip title={`复制${entity} ID`}>
        <IconButton
          size="small"
          aria-label={`复制${entity} ID`}
          onClick={(event) => {
            event.stopPropagation();
            void handleCopy();
          }}
          sx={{ p: 0.25, opacity: 0.55, "&:hover": { opacity: 1 } }}
        >
          <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
