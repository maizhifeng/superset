import { useState, useMemo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { formatNumber } from "@/utils/formatNumber";

export type CellFormatter = (key: string, value: unknown) => string;

function stripAgg(name: string): string {
  const m = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
  return m ? m[2] : name;
}

interface DataPreviewTableProps {
  data: { data?: unknown } | undefined | null;
  maxRows?: number;
  formatCell?: CellFormatter;
  sx?: SxProps<Theme>;
  onSortChange?: (sorts: { column: string; direction: "asc" | "desc" }[]) => void;
}

function defaultFormat(_key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function formatCell(
  key: string,
  value: unknown,
  formatter?: CellFormatter,
): string {
  if (formatter) return formatter(key, value);
  return defaultFormat(key, value);
}

type SortDirection = "desc" | "asc";

interface SortEntry {
  column: string;
  direction: SortDirection;
  locked: boolean;
}

export default function DataPreviewTable({
  data,
  maxRows = 100,
  formatCell: formatter,
  sx,
  onSortChange,
}: DataPreviewTableProps) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const rows = Array.isArray(data?.data)
    ? (data.data as Record<string, unknown>[])
    : [];
  const keys =
    rows.length > 0
      ? Object.keys(rows[0]).filter((k) => k !== "__isSummary")
      : [];

  const sortedRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const summaryRows = rows.filter((r) => r.__isSummary);
    const dataRows = rows.filter((r) => !r.__isSummary);
    if (sorts.length === 0) return rows;
    const sorted = [...dataRows];
    sorted.sort((a, b) => {
      for (const s of sorts) {
        const va = a[s.column];
        const vb = b[s.column];
        if (va == null && vb == null) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        let cmp: number;
        if (typeof va === "number" && typeof vb === "number") {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        if (cmp !== 0) return s.direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
    return [...sorted, ...summaryRows];
  }, [rows, sorts]);

  function computeNextSorts(prev: SortEntry[], key: string): SortEntry[] {
    const idx = prev.findIndex((s) => s.column === key);
    if (idx >= 0) {
      if (prev[idx].direction === "desc") {
        const next = [...prev];
        next[idx] = { ...next[idx], direction: "asc" };
        return next;
      }
      return prev.filter((s) => s.column !== key);
    }
    const lastLocked = prev.reduce((last, s, i) => (s.locked ? i : last), -1);
    if (lastLocked >= 0) {
      const next = [...prev];
      next.splice(lastLocked + 1, 0, {
        column: key,
        direction: "desc",
        locked: false,
      });
      return next;
    }
    return [{ column: key, direction: "desc", locked: false }];
  }

  const handleHeaderClick = (key: string) => {
    const next = computeNextSorts(sorts, key);
    setSorts(next);
    onSortChange?.(next.map((s) => ({ column: s.column, direction: s.direction })));
  };

  const handleLockToggle = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setSorts((prev) =>
      prev.map((s) => (s.column === key ? { ...s, locked: !s.locked } : s)),
    );
  };

  const dataRows = useMemo(
    () => sortedRows.filter((r) => !r.__isSummary),
    [sortedRows],
  );
  const summaryRows = useMemo(
    () => sortedRows.filter((r) => r.__isSummary),
    [sortedRows],
  );

  const totalPages = Math.ceil(Math.min(dataRows.length, maxRows) / pageSize);
  const pageStart = page * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, maxRows, dataRows.length);

  const pageRows = useMemo(
    () => [...dataRows.slice(pageStart, pageEnd), ...summaryRows],
    [dataRows, summaryRows, pageStart, pageEnd],
  );

  const empty = rows.length === 0;

  return (
    <TableContainer
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        ...(sx as object),
      }}
    >
      <Box sx={{ flex: 1, overflow: "auto", minHeight: 0, minWidth: 0 }}>
        <Table
          stickyHeader
          size="small"
          sx={{
            "& .MuiTableCell-root": {
              py: 0.5,
              px: 1,
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
            },
          }}
        >
          <TableHead
            sx={{
              bgcolor: "background.paper",
              "& .MuiTableRow-root": {
                position: "sticky",
                top: 0,
                zIndex: 2,
                bgcolor: "background.paper",
              },
            }}
          >
            <TableRow sx={{ bgcolor: "background.paper" }}>
              {empty ? (
                <TableCell align="center" colSpan={keys.length || 1}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ py: 2, display: "block" }}
                  >
                    无数据
                  </Typography>
                </TableCell>
              ) : (
                keys.map((k) => {
                  const sortEntry = sorts.find((s) => s.column === k);
                  const sortIdx = sortEntry ? sorts.indexOf(sortEntry) : -1;
                  return (
                    <TableCell
                      key={k}
                      onClick={() => handleHeaderClick(k)}
                      sx={{
                        fontWeight: 600,
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        bgcolor: "background.paper",
                        zIndex: 3,
                        backgroundClip: "padding-box",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.25,
                        }}
                      >
                        {stripAgg(k)}
                        {sortEntry ? (
                          sortEntry.direction === "desc" ? (
                            <ArrowDownwardIcon
                              sx={{ fontSize: 14, color: "primary.main" }}
                            />
                          ) : (
                            <ArrowUpwardIcon
                              sx={{ fontSize: 14, color: "primary.main" }}
                            />
                          )
                        ) : (
                          <UnfoldMoreIcon
                            sx={{
                              fontSize: 14,
                              color: "action.disabled",
                              opacity: 0.4,
                            }}
                          />
                        )}
                        {sortEntry && (
                          <Box
                            component="span"
                            onClick={(e) => handleLockToggle(e, k)}
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "pointer",
                              color: sortEntry.locked
                                ? "primary.main"
                                : "action.disabled",
                              opacity: sortEntry.locked ? 1 : 0.35,
                              "&:hover": { opacity: 1, color: "primary.main" },
                            }}
                          >
                            {sortEntry.locked ? (
                              <LockIcon sx={{ fontSize: 12 }} />
                            ) : (
                              <LockOpenIcon sx={{ fontSize: 12 }} />
                            )}
                          </Box>
                        )}
                        {sortEntry?.locked && (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              color: "primary.main",
                              lineHeight: 1,
                              ml: 0.1,
                            }}
                          >
                            {sortIdx + 1}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  );
                })
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {empty
              ? null
              : pageRows.map((row, i) => (
                  <TableRow
                    key={pageStart + i}
                    sx={
                      row.__isSummary
                        ? {
                            position: "sticky",
                            bottom: 0,
                            zIndex: 4,
                            "& .MuiTableCell-root": {
                              fontWeight: 700,
                              bgcolor: "grey.50",
                              borderTop: "2px solid",
                              borderTopColor: "divider",
                            },
                          }
                        : undefined
                    }
                  >
                    {keys.map((k) => (
                      <TableCell key={k}>
                        {formatCell(k, row[k], formatter)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Box>
      {!empty && totalPages > 1 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            py: 1,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {pageStart + 1}–{pageEnd} of {Math.min(sortedRows.length, maxRows)}
          </Typography>
          <Box
            component="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            sx={{
              border: "none",
              bgcolor: "transparent",
              cursor: page === 0 ? "default" : "pointer",
              color: page === 0 ? "text.disabled" : "primary.main",
              fontSize: "0.75rem",
              px: 1,
              py: 0.25,
            }}
          >
            ‹ 上一页
          </Box>
          <Box
            component="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            sx={{
              border: "none",
              bgcolor: "transparent",
              cursor: page >= totalPages - 1 ? "default" : "pointer",
              color: page >= totalPages - 1 ? "text.disabled" : "primary.main",
              fontSize: "0.75rem",
              px: 1,
              py: 0.25,
            }}
          >
            下一页 ›
          </Box>
        </Box>
      )}
    </TableContainer>
  );
}
