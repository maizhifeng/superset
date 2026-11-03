import { memo, useState, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import { tablePaginationLabels } from "@/utils/paginationLabels";
import TableRow from "@mui/material/TableRow";
import IconButton from "@mui/material/IconButton";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SearchIcon from "@mui/icons-material/Search";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import type { QueryResult } from "@/types/api";
import { downloadCsv } from "@/utils/exportCsv";
import { useNotificationStore } from "@/store/notificationStore";

/** 结果区操作按钮：窄视口下换行而不是被 flex 压扁（导致文字竖排变形）。 */
const resultActionSx = {
  textTransform: "none",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

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

function ResultsTable({
  result,
  page,
  rowsPerPage,
  paginatedData,
  onPageChange,
  onRowsPerPageChange,
}: ResultsTableProps) {
  const columns = result.columns.map((c) => c.name);
  const notify = useNotificationStore((s) => s.notify);
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
    else void rootRef.current?.requestFullscreen?.();
  };

  /** 复制结果列名（每行一个）。 */
  const handleCopyColumnNames = async () => {
    if (columns.length === 0) return;
    try {
      await navigator.clipboard.writeText(columns.join("\n"));
      notify({
        severity: "success",
        message: `已复制 ${columns.length} 个列名`,
      });
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

  const handleExport = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      columns,
      result.data,
      `query-${result.query_id ?? "result"}-${ts}.csv`,
    );
  };

  return (
    <Box
      ref={rootRef}
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        // 全屏时补上主题背景与内边距，避免透明背景露出浏览器默认黑底，
        // 让全屏视图与页面内表格样式保持一致。
        "&:fullscreen": {
          bgcolor: "background.default",
          color: "text.primary",
          p: 2,
        },
      }}
    >
      {/* 汇总信息 + 操作按钮：窄视口下整体换行，按钮不收缩变形。 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 2,
          rowGap: 1,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "1 1 220px",
          }}
        >
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => void handleCopyTsv()}
            disabled={result.data.length === 0}
            sx={resultActionSx}
          >
            复制为 TSV
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={result.data.length === 0}
            sx={resultActionSx}
          >
            导出为 CSV
          </Button>
          <Tooltip title="复制列名">
            <IconButton
              size="small"
              onClick={() => void handleCopyColumnNames()}
            >
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
      </Box>
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
        {...tablePaginationLabels}
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

/**
 * 结果表 memo 化：SQL 编辑器打字只改 sql state，结果数据与分页 props 均未变
 * （paginatedData 已由 useSqlLab 用 useMemo 保持引用稳定），因此父页面每次
 * 按键重渲染时应直接跳过整个结果区（大结果集时尤其明显）。
 */
export default memo(ResultsTable);
