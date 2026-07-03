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
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Autocomplete from "@mui/material/Autocomplete";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { QueryResult } from "@/types/api";

const DB_CONFIG = { database_id: 2, schema: "sj_platform", table: "part_papp" };

interface PappRow {
  papp_id: string;
  papp_name: string;
  updated_at: string;
  白名单控制参数: string;
}

const COLUMNS = ["papp_id", "papp_name", "updated_at", "白名单控制参数"];

const cardHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
};

export default function ProjectConfig() {
  const [rows, setRows] = useState<PappRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);



  const fetchRows = useCallback(async () => {
    const res = await api.get<{ result: PappRow[] }>("/project/papp");
    const sorted = (res.data.result ?? [])
      .map((r) => ({
        papp_id: String(r.papp_id),
        papp_name: r.papp_name ?? "",
        updated_at: r.updated_at ?? "",
        白名单控制参数: r.白名单控制参数 ?? "",
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setRows(sorted);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows().catch(() => {}).finally(() => setLoading(false));
  }, [fetchRows]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const sql = `SELECT * FROM ${DB_CONFIG.schema}.${DB_CONFIG.table}`;
      const q = await api.post<QueryResult>("/sqllab/execute/", {
        database_id: DB_CONFIG.database_id,
        sql,
      });

      const existingRes = await api.get<{ result: { papp_id: number; 白名单控制参数: string }[] }>(
        "/project/papp",
      );
      const existingParams = new Map<number, string>();
      for (const entry of existingRes.data.result ?? []) {
        if (entry.白名单控制参数) existingParams.set(entry.papp_id, entry.白名单控制参数);
      }

      let count = 0;
      for (const raw of q.data.data) {
        const pappId = Number(raw.papp_id);
        if (!pappId) continue;
        await api.put(`/project/papp/${pappId}`, {
          papp_name: String(raw.papp_name ?? ""),
          updated_at: String(raw.updated_at ?? ""),
          白名单控制参数: existingParams.get(pappId) ?? "",
        });
        count++;
      }
      await fetchRows();
      setSuccess(`已同步 ${count} 条`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "同步失败"));
    } finally {
      setSyncing(false);
    }
  }, [fetchRows]);

  const handleSave = useCallback(async (row: PappRow) => {
    setSaving((prev) => ({ ...prev, [row.papp_id]: true }));
    setError(null);
    setSuccess(null);
    try {
      await api.put(`/project/papp/${row.papp_id}`, {
        papp_name: row.papp_name,
        updated_at: row.updated_at,
        白名单控制参数: row.白名单控制参数,
      });
      setSuccess(`已保存 ${row.papp_name}`);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "保存失败"));
    } finally {
      setSaving((prev) => ({ ...prev, [row.papp_id]: false }));
    }
  }, []);

  const updateWhitelist = useCallback((pappId: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.papp_id === pappId ? { ...r, 白名单控制参数: checked ? "Y" : "" } : r,
      ),
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
  const [filterName, setFilterName] = useState<string | null>(null);
  const [whitelistOnly, setWhitelistOnly] = useState(false);
  const filteredRows = rows
    .filter((r) => !whitelistOnly || r.白名单控制参数 === "Y")
    .filter((r) => !filterName || r.papp_name === filterName);
  const visibleRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <Typography variant="body2" color="text.secondary">加载中...</Typography>
      </Box>
    );
  }

  return (
    <>
    <Box sx={{ p: 3 }}>

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
          title={`游戏 (${filteredRows.length})`}
          sx={cardHeaderSx}
          action={
            <Box sx={{ display: "flex", gap: 1, pr: 0.5, alignItems: "center" }}>
              <Autocomplete
                size="small"
                options={[...new Set(rows.map((r) => r.papp_name))].sort()}
                value={filterName}
                onChange={(_, v) => { setFilterName(v); setPage(0); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="搜索游戏..."
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
                    onChange={(_, c) => { setWhitelistOnly(c); setPage(0); }}
                  />
                }
                label={<Typography sx={{ fontSize: "0.75rem" }}>仅白名单</Typography>}
                sx={{ m: 0 }}
              />
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
                未加载数据。点击同步从数据库加载。
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
                            minWidth: col === "白名单控制参数" ? 80 : 100,
                            textAlign: "center",
                          }}
                        >
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, px: 0.5, textAlign: "center" }}>
                            {col === "白名单控制参数" ? (
                              <Tooltip title="勾选后该游戏将参与分成配置的白名单组合" arrow placement="top">
                                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.3, cursor: "help" }}>
                                  {col}
                                  <HelpOutlinedIcon sx={{ fontSize: "0.85rem", color: "text.secondary" }} />
                                </Box>
                              </Tooltip>
                            ) : col}
                          </Typography>
                        </TableCell>
                      ))}
                      <TableCell sx={{ fontWeight: 700, bgcolor: "grey.50", fontSize: "0.75rem", py: 1, width: 60, textAlign: "center" }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow key={row.papp_id}>
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
                            {row.updated_at}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center", minWidth: 80 }}>
                          <Checkbox
                            size="small"
                            checked={row.白名单控制参数 === "Y"}
                            onChange={(_, checked) => updateWhitelist(row.papp_id, checked)}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.5, textAlign: "center" }}>
                          <IconButton
                            size="small"
                            onClick={() => handleSave(row)}
                            disabled={saving[row.papp_id]}
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
                  ".MuiTablePagination-toolbar": { minHeight: 36, pl: 1, overflow: "hidden" },
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
      {success && (
        <Snackbar open autoHideDuration={3000} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} onClose={() => setSuccess(null)}>
          <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        </Snackbar>
      )}
      {error && (
        <Snackbar open autoHideDuration={6000} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} onClose={() => setError(null)}>
          <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
