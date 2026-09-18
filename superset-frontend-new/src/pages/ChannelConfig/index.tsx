import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
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
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import InputAdornment from "@mui/material/InputAdornment";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Checkbox from "@mui/material/Checkbox";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { QueryResult } from "@/types/api";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import {
  CHANNEL_SOURCES,
  GAME_REGIONS,
  REGION_LABELS,
  channelPayload,
  type GameRegion,
} from "@/config/regions";

interface ChannelRow {
  channel_key: string;
  channel_id: string;
  channel_name: string;
  updated_at: string;
  白名单控制参数: string;
  默认分成: string;
  ios虚拟支付分成: string;
}

const COLUMNS = [
  "channel_key",
  "channel_name",
  "updated_at",
  "默认分成",
  "ios虚拟支付分成",
  "白名单控制参数",
];

const COLUMN_LABELS: Record<string, string> = {
  channel_key: "渠道标识",
};

const cardHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
};

export default function ChannelConfig() {
  const [region, setRegion] = useState<GameRegion>("domestic");
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // Rows currently in edit mode. By default rows render as plain text to keep
  // the initial paint light; form controls mount only when a row is activated.
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchRows = useCallback(async (target: GameRegion) => {
    const res = await api.get<{ result: ChannelRow[] }>("/project/channel", {
      params: { region: target },
    });
    const sorted = (res.data.result ?? [])
      .map((r) => ({
        channel_key: String(r.channel_key ?? ""),
        channel_id: r.channel_id == null ? "" : String(r.channel_id),
        channel_name: r.channel_name ?? "",
        updated_at: r.updated_at ?? "",
        白名单控制参数: r.白名单控制参数 ?? "",
        默认分成: r.默认分成 ?? "",
        ios虚拟支付分成: r.ios虚拟支付分成 ?? "",
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setRows(sorted);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows(region)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchRows, region]);

  const handleSync = useCallback(async () => {
    const source = CHANNEL_SOURCES[region];
    setSyncing(true);
    setError(null);
    try {
      const q = await api.post<QueryResult>("/sqllab/execute/", {
        database_id: source.databaseId,
        sql: source.sql,
      });

      // 整表一次性回写：逐行 PUT 会触发应用级 50 req/s 限流。
      const channels = (q.data.data ?? [])
        .map((raw) => channelPayload(region, raw))
        .filter((channel) => channel !== null);

      const res = await api.post<{ result: { count: number } }>(
        "/project/channel/bulk",
        { region, channels },
      );
      await fetchRows(region);
      setSuccess(`已同步 ${REGION_LABELS[region]}渠道 ${res.data.result.count} 条`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "同步失败"));
    } finally {
      setSyncing(false);
    }
  }, [fetchRows, region]);

  const toggleEdit = useCallback((id: string) => {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitEdit = useCallback((id: string) => {
    setEditingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(
    async (row: ChannelRow) => {
      setSaving((prev) => ({ ...prev, [row.channel_key]: true }));
      setError(null);
      setSuccess(null);
      try {
        await api.put(`/project/channel/${row.channel_key}`, {
          region,
          channel_id: row.channel_id === "" ? null : Number(row.channel_id),
          channel_name: row.channel_name,
          updated_at: row.updated_at,
          白名单控制参数: row.白名单控制参数,
          默认分成: row.默认分成,
          ios虚拟支付分成: row.ios虚拟支付分成,
        });
        setSuccess(`已保存 ${row.channel_name}`);
        exitEdit(row.channel_key);
      } catch (err: unknown) {
        setError(parseErrorMessage(err, "保存失败"));
      } finally {
        setSaving((prev) => ({ ...prev, [row.channel_key]: false }));
      }
    },
    [exitEdit, region],
  );

  const updateWhitelist = useCallback((channelKey: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.channel_key === channelKey ? { ...r, 白名单控制参数: value } : r,
      ),
    );
  }, []);

  const updateDefaultSplit = useCallback(
    (channelKey: string, value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.channel_key === channelKey ? { ...r, 默认分成: value } : r,
        ),
      );
    },
    [],
  );

  const updateIosSplit = useCallback((channelKey: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.channel_key === channelKey ? { ...r, ios虚拟支付分成: value } : r,
      ),
    );
  }, []);

  const renderText = useCallback(
    (value: string | undefined, strong = false) => (
      <Typography
        sx={{
          fontSize: "0.75rem",
          px: 1,
          py: 0.5,
          textAlign: "center",
          fontWeight: strong ? 600 : 400,
          color: strong ? "text.secondary" : "text.primary",
        }}
      >
        {value ?? ""}
      </Typography>
    ),
    [],
  );

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const handleChangePage = useCallback(
    (_: unknown, p: number) => setPage(p),
    [],
  );
  const handleChangeRowsPerPage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(e.target.value, 10));
      setPage(0);
    },
    [],
  );
  const [filterName, setFilterName] = useState<string | null>(null);
  // 默认仅展示白名单渠道，可手动关闭以查看全部
  const [whitelistOnly, setWhitelistOnly] = useState(true);
  const filteredRows = rows
    .filter((r) => !whitelistOnly || r.白名单控制参数 === "Y")
    .filter((r) => !filterName || r.channel_name === filterName);
  const visibleRows = filteredRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  // 切换区域时重置筛选/分页/编辑态，避免把国内的行状态带到海外列表。
  const handleChangeRegion = useCallback((next: GameRegion) => {
    setRegion(next);
    setFilterName(null);
    setPage(0);
    setEditingIds(new Set());
  }, []);

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          p: 3,
          gap: 1.5,
        }}
      >
        {success && (
          <Snackbar
            open
            autoHideDuration={3000}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            onClose={() => setSuccess(null)}
          >
            <Alert
              severity="success"
              variant="filled"
              sx={{ borderRadius: 2 }}
              onClose={() => setSuccess(null)}
            >
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
            <Alert
              severity="error"
              variant="filled"
              sx={{ borderRadius: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          </Snackbar>
        )}

        <Tabs
          value={region}
          onChange={(_, v) => handleChangeRegion(v as GameRegion)}
          sx={{ minHeight: 0, borderBottom: 1, borderColor: "divider" }}
        >
          {GAME_REGIONS.map((r) => (
            <Tab
              key={r}
              value={r}
              label={`${REGION_LABELS[r]}渠道商`}
              sx={{ minHeight: 0, py: 1, fontSize: "0.8125rem" }}
            />
          ))}
        </Tabs>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <CardHeader
            title={`${REGION_LABELS[region]}渠道商 (${filteredRows.length})`}
            sx={cardHeaderSx}
            action={
              <Box
                sx={{ display: "flex", gap: 1, pr: 0.5, alignItems: "center" }}
              >
                <Autocomplete
                  size="small"
                  options={[...new Set(rows.map((r) => r.channel_name))].sort()}
                  value={filterName}
                  onChange={(_, v) => {
                    setFilterName(v);
                    setPage(0);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="搜索渠道..."
                      sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
                    />
                  )}
                  sx={{ width: 180 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={whitelistOnly}
                      onChange={(_, c) => {
                        setWhitelistOnly(c);
                        setPage(0);
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: "0.75rem" }}>
                      仅白名单
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    syncing ? <CircularProgress size={14} /> : <SyncIcon />
                  }
                  onClick={() => void handleSync()}
                  disabled={syncing}
                >
                  {syncing ? "同步中..." : "同步"}
                </Button>
              </Box>
            }
          />
          {loading ? (
            <CardContent sx={{ flex: 1 }}>
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  加载中...
                </Typography>
              </Box>
            </CardContent>
          ) : rows.length === 0 ? (
            <CardContent sx={{ flex: 1 }}>
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  {`未加载数据。点击同步从 ${CHANNEL_SOURCES[region].schema}.${CHANNEL_SOURCES[region].table} 加载${REGION_LABELS[region]}渠道商。`}
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={
                    syncing ? <CircularProgress size={14} /> : <SyncIcon />
                  }
                  onClick={() => void handleSync()}
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
                              minWidth: col === "白名单控制参数" ? 80 : 100,
                              textAlign: "center",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                px: 0.5,
                                textAlign: "center",
                              }}
                            >
                              {col === "白名单控制参数" ? (
                                <Tooltip
                                  title="勾选后该渠道商将参与分成配置的白名单组合"
                                  arrow
                                  placement="top"
                                >
                                  <Box
                                    component="span"
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 0.3,
                                      cursor: "help",
                                    }}
                                  >
                                    {col}
                                    <HelpOutlinedIcon
                                      sx={{
                                        fontSize: "0.85rem",
                                        color: "text.secondary",
                                      }}
                                    />
                                  </Box>
                                </Tooltip>
                              ) : (
                                (COLUMN_LABELS[col] ?? col)
                              )}
                            </Typography>
                          </TableCell>
                        ))}
                        <TableCell
                          sx={{
                            fontWeight: 700,
                            bgcolor: "grey.50",
                            fontSize: "0.75rem",
                            py: 1,
                            width: 60,
                            textAlign: "center",
                          }}
                        />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={COLUMNS.length + 1}
                            sx={{ textAlign: "center", py: 4 }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              {whitelistOnly
                                ? "暂无白名单渠道商，关闭「仅白名单」可查看全部。"
                                : "当前筛选条件下没有渠道商。"}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                      {visibleRows.map((row) => {
                        const editing = editingIds.has(row.channel_key);
                        return (
                        <TableRow key={row.channel_key}>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography
                            sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}
                          >
                            {row.channel_key}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography
                            sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}
                          >
                            {row.channel_name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Typography
                            sx={{ fontSize: "0.75rem", px: 1, py: 0.5 }}
                          >
                            {row.updated_at}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{ p: 0.5, textAlign: "center", minWidth: 120 }}
                        >
                          {editing ? (
                            <TextField
                              size="small"
                              variant="standard"
                              value={row.默认分成}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^\d*\.?\d*$/.test(v) || v === "") {
                                  updateDefaultSplit(row.channel_key, v);
                                }
                              }}
                              slotProps={{
                                input: {
                                  sx: {
                                    fontSize: "0.75rem",
                                    textAlign: "center",
                                    py: 0.5,
                                  },
                                  endAdornment: (
                                    <InputAdornment
                                      position="end"
                                      sx={{
                                        "& .MuiTypography-root": {
                                          fontSize: "0.75rem",
                                        },
                                      }}
                                    >
                                      %
                                    </InputAdornment>
                                  ),
                                },
                              }}
                              sx={{ "& input": { textAlign: "center" } }}
                            />
                          ) : (
                            renderText(row.默认分成)
                          )}
                        </TableCell>
                        <TableCell
                          sx={{ p: 0.5, textAlign: "center", minWidth: 120 }}
                        >
                          {editing ? (
                            <TextField
                              size="small"
                              variant="standard"
                              value={row.ios虚拟支付分成}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^\d*\.?\d*$/.test(v) || v === "") {
                                  updateIosSplit(row.channel_key, v);
                                }
                              }}
                              slotProps={{
                                input: {
                                  sx: {
                                    fontSize: "0.75rem",
                                    textAlign: "center",
                                    py: 0.5,
                                  },
                                  endAdornment: (
                                    <InputAdornment
                                      position="end"
                                      sx={{
                                        "& .MuiTypography-root": {
                                          fontSize: "0.75rem",
                                        },
                                      }}
                                    >
                                      %
                                    </InputAdornment>
                                  ),
                                },
                              }}
                              sx={{ "& input": { textAlign: "center" } }}
                            />
                          ) : (
                            renderText(row.ios虚拟支付分成)
                          )}
                        </TableCell>
                        <TableCell
                          sx={{ p: 0.5, textAlign: "center", minWidth: 80 }}
                        >
                          {editing ? (
                            <Checkbox
                              size="small"
                              checked={row.白名单控制参数 === "Y"}
                              onChange={(_, checked) =>
                                updateWhitelist(
                                  row.channel_key,
                                  checked ? "Y" : "",
                                )
                              }
                            />
                          ) : (
                            renderText(
                              row.白名单控制参数 === "Y" ? "白名单" : "",
                              true,
                            )
                          )}
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              gap: 0.25,
                            }}
                          >
                            {editing ? (
                              <>
                                <IconButton
                                  size="small"
                                  onClick={() => void handleSave(row)}
                                  disabled={saving[row.channel_key]}
                                  color="primary"
                                  aria-label="保存"
                                >
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => exitEdit(row.channel_key)}
                                  disabled={saving[row.channel_key]}
                                  aria-label="取消编辑"
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </>
                            ) : (
                              <IconButton
                                size="small"
                                onClick={() => toggleEdit(row.channel_key)}
                                aria-label="编辑"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        </TableCell>
                        </TableRow>
                        );
                      })}
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
                  overflow: "hidden",
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
                    ".MuiTablePagination-toolbar": {
                      minHeight: 36,
                      pl: 1,
                      overflow: "hidden",
                    },
                    ".MuiTablePagination-selectLabel, .MuiTablePagination-input":
                      {
                        fontSize: "0.75rem",
                      },
                    ".MuiTablePagination-displayedRows": {
                      fontSize: "0.75rem",
                    },
                  }}
                />
              </Box>
            </>
          )}
        </Card>
      </Box>
    </>
  );
}
