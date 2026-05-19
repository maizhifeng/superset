import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import Chip from "@mui/material/Chip";
import DataPreviewTable from "@/components/DataPreviewTable";
import type { CellFormatter } from "@/components/DataPreviewTable";
import type { CompareDimension } from "@/pages/Dashboard/ChartCard";

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
          Comparing by:
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
