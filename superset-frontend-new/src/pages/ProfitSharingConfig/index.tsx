import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import IconButton from "@mui/material/IconButton";
import SaveIcon from "@mui/icons-material/Save";
import SyncIcon from "@mui/icons-material/Sync";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

interface WhitelistRow {
  id: number;
  papp_id: number;
  papp_name: string;
  channel_id: number;
  channel_name: string;
  上线时间: string;
  渠道商分成: string;
  分成比例: string;
  研发分成: string;
  IP分成: string;
  分成方式: string;
}

const SPLIT_TYPES = ["流水分成", "利润后分成"];

const COLUMNS = ["papp_id", "papp_name", "channel_id", "channel_name", "渠道商分成", "研发分成", "IP分成", "分成比例", "分成方式", "上线时间"];

const COL_DESCS: Record<string, string> = {
  "分成比例": "最终净比例（流水分成: 1-渠道商%-研发%-IP%；利润后分成: (1-渠道商%-IP%)×(1-研发%)）",
  "分成方式": "流水分成：各比例基于流水X；利润后分成：研发分成基于扣除渠道商和IP后的剩余部分",
};

const cardHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
};

export default function ProfitSharingConfig() {
  const [rows, setRows] = useState<WhitelistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    const res = await api.get<{ result: WhitelistRow[] }>(
      "/project/profit-sharing",
    );
    const mapped = (res.data.result ?? []).map((r) => ({
      ...r,
      分成方式: r.分成方式 || "流水分成",
    }));
    setRows(mapped);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows().catch(() => {}).finally(() => setLoading(false));
  }, [fetchRows]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await api.post<{ result: { count: number } }>(
        "/project/profit-sharing/sync",
      );
      await fetchRows();
      setSuccess(`已同步 ${res.data.result.count} 条`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "同步失败"));
    } finally {
      setSyncing(false);
    }
  }, [fetchRows]);

  const handleSaveAll = useCallback(async () => {
    setSaving({});
    setError(null);
    setSuccess(null);
    try {
      const promises = rows.map((row) =>
        api.put(`/project/profit-sharing/${row.id}`, {
          上线时间: row.上线时间,
          渠道商分成: row.渠道商分成,
          分成比例: row.分成比例,
          研发分成: row.研发分成,
          IP分成: row.IP分成,
          分成方式: row.分成方式,
        }),
      );
      await Promise.all(promises);
      setSuccess(`已全部保存 (${rows.length} 条)`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "保存失败"));
    } finally {
      setSaving({});
    }
  }, [rows]);

  const handleSave = useCallback(async (row: WhitelistRow) => {
    setSaving((prev) => ({ ...prev, [row.id]: true }));
    setError(null);
    setSuccess(null);
    try {
      await api.put(`/project/profit-sharing/${row.id}`, {
        上线时间: row.上线时间,
        渠道商分成: row.渠道商分成,
        分成比例: row.分成比例,
        研发分成: row.研发分成,
        IP分成: row.IP分成,
        分成方式: row.分成方式,
      });
      setSuccess(`已保存`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "保存失败"));
    } finally {
      setSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  }, []);

  const updateField = useCallback((id: number, field: "上线时间" | "渠道商分成" | "研发分成" | "IP分成" | "分成方式", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  }, []);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const handleChangePage = useCallback((_: unknown, p: number) => setPage(p), []);
  const handleChangeRowsPerPage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(e.target.value, 10));
      setPage(0);
    },
    [],
  );

  const [filterGame, setFilterGame] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const filteredRows = rows.filter((r) => {
    if (filterGame && r.papp_name !== filterGame) return false;
    if (filterChannel && r.channel_name !== filterChannel) return false;
    return true;
  });
  const visibleRows = filteredRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const gameOptions = [...new Set(rows.map((r) => r.papp_name))].sort();
  const channelOptions = [...new Set(rows.map((r) => r.channel_name))].sort();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <Typography variant="body2" color="text.secondary">
          加载中...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {success && (
        <Snackbar
          open
          autoHideDuration={3000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={() => setSuccess(null)}
        >
          <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        </Snackbar>
      )}
      {error && (
        <Snackbar
          open
          autoHideDuration={6000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={() => setError(null)}
        >
          <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>
      )}

      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 80px)",
        }}
      >
        <CardHeader
          title={`分成配置 (${filteredRows.length})`}
          sx={cardHeaderSx}
          action={
            <Box sx={{ display: "flex", gap: 1, pr: 0.5, alignItems: "center" }}>
              <Autocomplete
                size="small"
                options={gameOptions}
                value={filterGame}
                onChange={(_, v) => { setFilterGame(v); setPage(0); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="搜索游戏..."
                    sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
                  />
                )}
                sx={{ width: 140 }}
              />
              <Autocomplete
                size="small"
                options={channelOptions}
                value={filterChannel}
                onChange={(_, v) => { setFilterChannel(v); setPage(0); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="搜索渠道..."
                    sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
                  />
                )}
                sx={{ width: 140 }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveAll}
              >
                全部保存
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? "同步中..." : "同步"}
              </Button>
            </Box>
          }
        />
        {rows.length === 0 ? (
          <CardContent sx={{ flex: 1 }}>
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                暂无分成配置。请先在游戏配置和渠道商配置中启用白名单，然后点击同步。
              </Typography>
              <Button
                variant="outlined"
                startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? "同步中..." : "同步"}
              </Button>
            </Box>
          </CardContent>
        ) : (
          <>
            <CardContent sx={{ flex: 1, overflow: "auto", pt: 0 }}>
              <TableContainer
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  overflow: "visible",
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {COLUMNS.map((col) => (
                        <TableCell
                          key={col}
                          sx={{
                            fontWeight: 700,
                            bgcolor: "grey.50",
                            fontSize: "0.75rem",
                            py: 1,
                            minWidth: col === "上线时间" ? 90 : col === "分成比例" ? 100 : col === "渠道商分成" || col === "研发分成" || col === "IP分成" ? 90 : col === "分成方式" ? 120 : col === "channel_id" || col === "papp_id" || col === "id" ? 70 : 90,
                            textAlign: "center",
                          }}
                        >
                          <Tooltip title={COL_DESCS[col] || ""} placement="top" arrow>
                            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                              <Typography
                                sx={{
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  px: 0.5,
                                  textAlign: "center",
                                }}
                              >
                                {col}
                              </Typography>
                              {COL_DESCS[col] && (
                                <Typography component="span" sx={{ fontSize: "0.7rem", color: "info.main", fontWeight: 700, cursor: "help" }}>?</Typography>
                              )}
                            </Box>
                          </Tooltip>
                        </TableCell>
                      ))}
                      <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", fontSize: "0.75rem", py: 1, width: 60, textAlign: "center" }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}>
                            {row.papp_id}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}>
                            {row.papp_name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}>
                            {row.channel_id}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}>
                            {row.channel_name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 90 }}>
                          <TextField
                            size="small"
                            variant="standard"
                            value={row.渠道商分成}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^\d*\.?\d*$/.test(v) || v === "") {
                                updateField(row.id, "渠道商分成", v);
                              }
                            }}
                            slotProps={{
                              input: {
                                sx: { fontSize: "0.75rem", textAlign: "center", py: 0.5 },
                                endAdornment: <InputAdornment position="end" sx={{ "& .MuiTypography-root": { fontSize: "0.75rem" } }}>%</InputAdornment>,
                              },
                            }}
                            sx={{ "& input": { textAlign: "center" } }}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 90 }}>
                          <TextField
                            size="small"
                            variant="standard"
                            value={row.研发分成}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^\d*\.?\d*$/.test(v) || v === "") {
                                updateField(row.id, "研发分成", v);
                              }
                            }}
                            slotProps={{
                              input: {
                                sx: { fontSize: "0.75rem", textAlign: "center", py: 0.5 },
                                endAdornment: <InputAdornment position="end" sx={{ "& .MuiTypography-root": { fontSize: "0.75rem" } }}>%</InputAdornment>,
                              },
                            }}
                            sx={{ "& input": { textAlign: "center" } }}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 90 }}>
                          <TextField
                            size="small"
                            variant="standard"
                            value={row.IP分成}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^\d*\.?\d*$/.test(v) || v === "") {
                                updateField(row.id, "IP分成", v);
                              }
                            }}
                            slotProps={{
                              input: {
                                sx: { fontSize: "0.75rem", textAlign: "center", py: 0.5 },
                                endAdornment: <InputAdornment position="end" sx={{ "& .MuiTypography-root": { fontSize: "0.75rem" } }}>%</InputAdornment>,
                              },
                            }}
                            sx={{ "& input": { textAlign: "center" } }}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 100 }}>
                          <Typography sx={{ fontSize: "0.75rem", px: 1, py: 0.5, fontWeight: 600, color: "text.secondary" }}>
                            {row.分成比例 || `${(() => {
                              const qd = parseFloat(row.渠道商分成 || '0');
                              const yf = parseFloat(row.研发分成 || '0');
                              const ip = parseFloat(row.IP分成 || '0');
                              return row.分成方式 === "利润后分成"
                                ? ((100 - qd - ip) * (100 - yf) / 100).toFixed(1)
                                : (100 - qd - yf - ip).toFixed(1);
                            })()}%`}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 120 }}>
                          <Select
                            size="small"
                            variant="standard"
                            value={row.分成方式}
                            onChange={(e) => updateField(row.id, "分成方式", e.target.value)}
                            sx={{ fontSize: "0.75rem", "& .MuiSelect-select": { py: 0.5 } }}
                          >
                            {SPLIT_TYPES.map((t) => (
                              <MenuItem key={t} value={t} sx={{ fontSize: "0.75rem" }}>{t}</MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 100 }}>
                          <DatePicker
                            format="YYYY/MM/DD"
                            value={row.上线时间 ? dayjs(row.上线时间) : null}
                            onChange={(v) =>
                              updateField(row.id, "上线时间", v ? v.format("YYYY/MM/DD") : "")
                            }
                            slotProps={{
                              textField: {
                                size: "small",
                                variant: "standard",
                                sx: {
                                  "& input": { fontSize: "0.75rem", textAlign: "center", py: 0.5 },
                                  "& .MuiSvgIcon-root": { fontSize: "1rem" },
                                },
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <IconButton
                            size="small"
                            onClick={() => handleSave(row)}
                            disabled={saving[row.id]}
                            color="primary"
                          >
                            <SaveIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                px: 2,
                py: 0.5,
                borderTop: "1px solid",
                borderColor: "divider",
                bgcolor: "grey.50",
                flexShrink: 0,
              }}
            >
              <TablePagination
                component="div"
                count={filteredRows.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[10, 25, 50, 100]}
                sx={{
                  ".MuiTablePagination-toolbar": { minHeight: 36, pl: 1 },
                  ".MuiTablePagination-selectLabel, .MuiTablePagination-input": {
                    fontSize: "0.75rem",
                  },
                  ".MuiTablePagination-displayedRows": { fontSize: "0.75rem" },
                }}
              />
            </Box>
          </>
        )}
      </Card>
    </Box>
  );
}
