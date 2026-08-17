import { useState, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import IconButton from "@mui/material/IconButton";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import TableChartIcon from "@mui/icons-material/TableChart";
import CodeIcon from "@mui/icons-material/Code";
import SearchIcon from "@mui/icons-material/Search";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import type { QueryResult } from "@/types/api";
import { downloadCsv } from "@/utils/exportCsv";
import { useNotificationStore } from "@/store/notificationStore";

function tsvCell(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\t/g, " ");
}

interface ResultsTableProps {
  result: QueryResult;
  page: number;
  rowsPerPage: number;
  paginatedData: Record<string, unknown>[];
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
}

export default function ResultsTable({
  result,
  page,
  rowsPerPage,
  paginatedData,
  onPageChange,
  onRowsPerPageChange,
}: ResultsTableProps) {
  const columns = result.columns.map((c) => c.name);
  const notify = useNotificationStore((s) => s.notify);
  const [showSql, setShowSql] = useState(false);
  const [jumpRow, setJumpRow] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  };
  const executedSql = result.query?.sql || "";

  /** 复制当前查询执行的原始 SQL。 */
  const handleCopyExecutedSql = async () => {
    if (!executedSql) return;
    try {
      await navigator.clipboard.writeText(executedSql);
      notify({ severity: "success", message: "已复制执行的 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制结果列名（每行一个）。 */
  const handleCopyColumnNames = async () => {
    if (columns.length === 0) return;
    try {
      await navigator.clipboard.writeText(columns.join("\n"));
      notify({ severity: "success", message: `已复制 ${columns.length} 个列名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const handleCopyTsv = async () => {
    const rows = result.data;
    if (rows.length === 0) return;
    const header = columns.join("\t");
    const lines = rows.map((r) => columns.map((c) => tsvCell(r[c])).join("\t"));
    try {
      await navigator.clipboard.writeText([header, ...lines].join("\n"));
      notify({ severity: "success", message: "已复制查询结果（TSV）" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  // 复制为 Markdown 表格，便于粘贴到文档 / 聊天 / 周报中分享。
  const handleCopyMarkdown = async () => {
    const rows = result.data;
    if (rows.length === 0) return;
    const esc = (v: unknown): string =>
      String(v ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
    const header = `| ${columns.join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const lines = rows.map(
      (r) => `| ${columns.map((c) => esc(r[c])).join(" | ")} |`,
    );
    try {
      await navigator.clipboard.writeText(
        [header, divider, ...lines].join("\n"),
      );
      notify({ severity: "success", message: "已复制查询结果（Markdown）" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const handleExport = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      columns,
      result.data,
      `query-${result.query_id ?? "result"}-${ts}.csv`,
    );
  };

  /** 导出结果为 JSON 文件。 */
  const handleExportJson = () => {
    if (result.data.length === 0) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `query-${result.query_id ?? "result"}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /** 复制为 SQL INSERT（取 FROM 表名 + 结果列与行）。 */
  const handleCopyInsert = async () => {
    const rows = result.data;
    if (rows.length === 0 || columns.length === 0) return;
    const fromMatch = (executedSql || "").match(
      /\b(?:from|join)\s+[`"[]?(?:[\w$-]+\.)?[`"[]?([\w$-]+)/i,
    );
    const table = fromMatch?.[1] ?? "result";
    const esc = (v: unknown): string => {
      if (v == null) return "NULL";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    const valueClause = rows
      .map((r) => `(${columns.map((c) => esc(r[c])).join(", ")})`)
      .join(",\n  ");
    const sqlText = `INSERT INTO ${table} (${columns.join(", ")})\nVALUES\n  ${valueClause};`;
    try {
      await navigator.clipboard.writeText(sqlText);
      notify({ severity: "success", message: "已复制 INSERT 语句" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Box
      ref={rootRef}
      sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}
      >
        <Typography variant="body2" color="text.secondary">
          共 {result.query?.rows ?? result.data.length} 行
          {result.query?.rows != null && result.query.rows > result.data.length
            ? `（已显示前 ${result.data.length} 行）`
            : ""}
          {result.query_id ? ` · query #${result.query_id}` : ""}
          {result.query?.queryId
            ? ` · server query #${result.query.queryId}`
            : ""}
          {result.query?.state ? ` · ${result.query.state}` : ""}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {executedSql && (
          <Button
            size="small"
            variant="text"
            startIcon={<CodeIcon />}
            endIcon={
              showSql ? (
                <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
              ) : (
                <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
              )
            }
            onClick={() => setShowSql((v) => !v)}
            sx={{ textTransform: "none", mr: 1, minWidth: 0 }}
          >
            SQL
          </Button>
        )}
        {executedSql && (
          <Tooltip title="复制执行的 SQL">
            <Button
              size="small"
              variant="text"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyExecutedSql()}
              sx={{ textTransform: "none", mr: 1, minWidth: 0 }}
            >
              复制 SQL
            </Button>
          </Tooltip>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={<TableChartIcon />}
          onClick={() => void handleCopyMarkdown()}
          disabled={result.data.length === 0}
          sx={{ textTransform: "none", mr: 1 }}
        >
          复制为 Markdown
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => void handleCopyTsv()}
          disabled={result.data.length === 0}
          sx={{ textTransform: "none", mr: 1 }}
        >
          复制为 TSV
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          disabled={result.data.length === 0}
          sx={{ textTransform: "none" }}
        >
          导出为 CSV
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportJson}
          disabled={result.data.length === 0}
          sx={{ textTransform: "none" }}
        >
          导出 JSON
        </Button>
        <Tooltip title="复制列名">
          <IconButton size="small" onClick={() => void handleCopyColumnNames()}>
            <ViewColumnIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={isFullscreen ? "退出全屏" : "全屏查看结果"}>
          <IconButton size="small" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <FullscreenExitIcon sx={{ fontSize: 16 }} />
            ) : (
              <FullscreenIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={showSql} unmountOnExit>
        <Paper
          variant="outlined"
          sx={{ mt: 1, p: 1.25, borderRadius: 1.5, overflow: "auto" }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              已执行 SQL
            </Typography>
            <Button
              size="small"
              variant="text"
              startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
              onClick={() => void handleCopyInsert()}
              disabled={result.data.length === 0}
              sx={{ textTransform: "none", minHeight: 0 }}
            >
              复制 INSERT
            </Button>
          </Box>
          <Box
            component="pre"
            sx={{
              m: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              color: "text.primary",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {executedSql}
          </Box>
        </Paper>
      </Collapse>
      <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, mt: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {result.columns.map((col) => (
                <TableCell
                  key={col.name}
                  sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                >
                  {col.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={result.columns.length}
                  sx={{ textAlign: "center", py: 4, color: "text.secondary" }}
                >
                  无数据
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map((col) => (
                    <TableCell
                      key={col.name}
                      sx={{
                        fontSize: "0.75rem",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(row[col.name] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 0,
          px: 1,
          pt: 0.5,
        }}
      >
        <TextField
          size="small"
          variant="standard"
          placeholder="跳转到行 #"
          value={jumpRow}
          onChange={(e) => setJumpRow(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => {
            const n = Number(jumpRow);
            if (Number.isInteger(n) && n >= 1 && n <= result.data.length) {
              onPageChange(Math.floor((n - 1) / rowsPerPage));
            }
            setJumpRow("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ width: 130 }}
        />
      </Box>
      <TablePagination
        component="div"
        count={result.data.length}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          onRowsPerPageChange(parseInt(e.target.value, 10));
          onPageChange(0);
        }}
        rowsPerPageOptions={[25, 50, 100, 500]}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  );
}
