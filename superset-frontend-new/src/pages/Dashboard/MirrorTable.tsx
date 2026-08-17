import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import Chip from "@mui/material/Chip";
import { useNotificationStore } from "@/store/notificationStore";
import DataPreviewTable from "@/components/DataPreviewTable";
import type { CellFormatter } from "@/components/DataPreviewTable";
import type { CompareDimension } from "@/pages/Dashboard/ChartCard";
import { downloadCsv } from "@/utils/exportCsv";

interface MirrorTableProps {
  dimensions: CompareDimension[];
  data?: Record<string, unknown>;
  onClose: () => void;
  formatCell?: CellFormatter;
}

export default function MirrorTable({
  dimensions,
  data,
  onClose,
  formatCell,
}: MirrorTableProps) {
  const dateCols = useMemo(() => {
    const colnames = data?.colnames as string[] | undefined;
    const coltypes = data?.coltypes as number[] | undefined;
    if (!colnames || !coltypes) return new Set<string>();
    return new Set(colnames.filter((_, i) => coltypes[i] === 2));
  }, [data]);

  function fmtVal(dim: string, raw: string): string {
    if (!dateCols.has(dim)) return raw;
    const num = Number(raw);
    if (num > 1e12 && num < 1e16) {
      const d = new Date(num);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return raw;
  }

  const handleExport = () => {
    const raw = data?.data;
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]).filter((k) => k !== "__isSummary");
    downloadCsv(cols, rows, "compare-data.csv");
  };

  const notify = useNotificationStore((s) => s.notify);
  const handleCopyMarkdown = async () => {
    const raw = data?.data;
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]).filter((k) => k !== "__isSummary");
    const esc = (v: unknown): string =>
      String(v ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
    const text = [
      `| ${cols.join(" | ")} |`,
      `| ${cols.map(() => "---").join(" | ")} |`,
      ...rows.map((r) => `| ${cols.map((c) => esc(r[c])).join(" | ")} |`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify({ severity: "success", message: "已复制对比结果为 Markdown" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          px: 1.5,
          py: 0.5,
          bgcolor: "primary.50",
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: "primary.200",
          flexShrink: 0,
        }}
      >
        <FilterAltIcon sx={{ fontSize: 14, color: "primary.700" }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: "primary.700" }}
        >
          对比依据：
        </Typography>
        {dimensions.map((d, i) => (
          <Chip
            key={i}
            label={`${d.dimension} IN (${d.values.map((v) => fmtVal(d.dimension, v)).join(", ")})`}
            size="small"
            variant="outlined"
            sx={{
              fontSize: 11,
              color: "primary.700",
              borderColor: "primary.300",
            }}
          />
        ))}
        <Tooltip title="复制为 Markdown">
          <span>
            <IconButton
              size="small"
              onClick={() => void handleCopyMarkdown()}
              aria-label="复制为 Markdown"
              disabled={!(Array.isArray(data?.data) && data.data.length > 0)}
              sx={{ p: 0.25 }}
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="导出为 CSV">
          <span>
            <IconButton
              size="small"
              onClick={handleExport}
              aria-label="导出为 CSV"
              disabled={!(Array.isArray(data?.data) && data.data.length > 0)}
              sx={{ p: 0.25 }}
            >
              <DownloadIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size="small" onClick={onClose} sx={{ p: 0.25, ml: "auto" }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <DataPreviewTable data={data} maxRows={100} formatCell={formatCell} />
      </Box>
    </Box>
  );
}
