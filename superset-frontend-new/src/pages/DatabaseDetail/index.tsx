import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import StorageIcon from "@mui/icons-material/Storage";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import api from "@/api";
import type { DatabaseDetail } from "@/types/api";

export default function DatabaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [db, setDb] = useState<DatabaseDetail | null>(null);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<{ result: DatabaseDetail }>(`/database/${id}`),
      api.get<{ result: string[] }>(`/database/${id}/schemas/`),
    ])
      .then(([dbResp, schemasResp]) => {
        setDb(dbResp.data.result);
        setSchemas(schemasResp.data.result ?? []);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err.message || "加载失败");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!db) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          数据库不存在
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <Tooltip title="返回列表">
          <IconButton size="small" onClick={() => navigate("/database/list")}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <StorageIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {db.database_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {db.backend} / {db.driver}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Chip
            label={db.expose_in_sqllab ? "SQL 实验室已启用" : "SQL 实验室已禁用"}
            color={db.expose_in_sqllab ? "success" : "default"}
            size="small"
          />
          <Chip
            label={db.allow_dml ? "DML 已允许" : "DML 已禁用"}
            color={db.allow_dml ? "warning" : "default"}
            size="small"
          />
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="概览" />
        <Tab label={`Schema (${schemas.length})`} />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "var(--mui-palette-shadow-sm)" }}>
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", width: 220 }}>
                  数据库名称
                </TableCell>
                <TableCell>{db.database_name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  后端
                </TableCell>
                <TableCell>{db.backend}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  驱动
                </TableCell>
                <TableCell>{db.driver}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  UUID
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                  {db.uuid}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  配置方式
                </TableCell>
                <TableCell>{db.configuration_method}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  SQL 实验室
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.expose_in_sqllab ? "已启用" : "已禁用"}
                    color={db.expose_in_sqllab ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  DML
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_dml ? "允许" : "禁用"}
                    color={db.allow_dml ? "warning" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  CTAS
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_ctas ? "允许" : "禁用"}
                    color={db.allow_ctas ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  CVAS
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_cvas ? "允许" : "禁用"}
                    color={db.allow_cvas ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  文件上传
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_file_upload ? "允许" : "禁用"}
                    color={db.allow_file_upload ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  异步查询
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_run_async ? "允许" : "禁用"}
                    color={db.allow_run_async ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  缓存超时
                </TableCell>
                <TableCell>{db.cache_timeout != null ? `${db.cache_timeout}s` : "未设置"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  模拟用户
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.impersonate_user ? "是" : "否"}
                    color={db.impersonate_user ? "info" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  外部管理
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.is_managed_externally ? "是" : "否"}
                    color={db.is_managed_externally ? "info" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  SSH 隧道
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.engine_information.disable_ssh_tunneling ? "已禁用" : "可用"}
                    color={db.engine_information.disable_ssh_tunneling ? "default" : "success"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  动态目录
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.engine_information.supports_dynamic_catalog ? "支持" : "不支持"}
                    color={db.engine_information.supports_dynamic_catalog ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <Paper sx={{ borderRadius: 2, boxShadow: "var(--mui-palette-shadow-sm)" }}>
          {schemas.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                暂无 Schema
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Schema 名称</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schemas.map((s) => (
                    <TableRow key={s} hover>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                        {s}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}
    </Box>
  );
}
