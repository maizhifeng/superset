import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import PageHeader from "@/components/PageHeader";
import api from "@/api";
import rison from "rison";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { Database, TableResult } from "@/types/api";

export default function DatasetCreation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initDatabase = Number(searchParams.get("database")) || "";
  const initSchema = searchParams.get("schema") ?? "";
  const initTable = searchParams.get("table") ?? "";
  const [databases, setDatabases] = useState<Database[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<TableResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const [databaseId, setDatabaseId] = useState<number | "">(initDatabase);
  const [schema, setSchema] = useState(initSchema);
  const [tableName, setTableName] = useState(initTable);

  // 从 URL 参数预填（兜底首帧渲染时序：参数字典可能晚于首帧可用）。
  useEffect(() => {
    if (searchParams.get("database")) {
      setDatabaseId(Number(searchParams.get("database")) || "");
    }
    if (searchParams.get("schema")) setSchema(searchParams.get("schema")!);
    if (searchParams.get("table")) setTableName(searchParams.get("table")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:50,page:0)")
      .then((res) => {
        setDatabases(res.data.result);
        setLoading(false);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, "加载数据库失败"));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (databaseId === "") {
      setSchemas([]);
      setTables([]);
      setSchema("");
      return;
    }
    setSchemasLoading(true);
    api
      .get<{ result: string[] }>(`/database/${databaseId}/schemas/`)
      .then((res) => {
        setSchemas(res.data.result);
        setSchemasLoading(false);
      })
      .catch(() => {
        setSchemas([]);
        setSchemasLoading(false);
      });
  }, [databaseId]);

  useEffect(() => {
    if (databaseId === "" || !schema) {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    const qs = rison.encode({ schema_name: schema });
    api
      .get<{ result: TableResult[] }>(`/database/${databaseId}/tables/?q=${qs}`)
      .then((res) => {
        setTables(res.data.result);
        setTablesLoading(false);
      })
      .catch(() => {
        setTables([]);
        setTablesLoading(false);
      });
  }, [databaseId, schema]);

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitting(true);

    const payload = {
      table_name: tableName,
      database: databaseId,
      schema,
    };

    try {
      const res = await api.post<{ id?: number }>("/dataset/", payload);
      const createdId = res.data?.id;
      if (createdId != null) {
        setCreatedId(createdId);
      }
      setSubmitSuccess(true);
      setTableName("");
      setSchema("");
      setDatabaseId("");
    } catch (err: unknown) {
      setSubmitError(parseErrorMessage(err, "创建数据集失败"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="创建数据集" />
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="创建数据集" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="创建数据集" />
      {submitSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          action={
            createdId != null ? (
              <Button
                size="small"
                color="inherit"
                onClick={() => navigate(`/dataset/edit/${createdId}`)}
              >
                立即打开编辑
              </Button>
            ) : undefined
          }
        >
          数据集创建成功
        </Alert>
      )}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}
      <Box
        sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 480 }}
      >
        <TextField
          select
          label="数据库"
          value={databaseId}
          onChange={(e) => {
            setDatabaseId(Number(e.target.value));
            setTableName("");
          }}
          fullWidth
        >
          {databases.map((db) => (
            <MenuItem key={db.id} value={db.id}>
              {db.database_name}
            </MenuItem>
          ))}
        </TextField>
        {databaseId !== "" && (
          <TextField
            select
            label="模式"
            value={schema}
            onChange={(e) => {
              setSchema(e.target.value);
              setTableName("");
            }}
            fullWidth
            disabled={schemasLoading}
          >
            {schemasLoading ? (
              <MenuItem disabled>加载中...</MenuItem>
            ) : schemas.length === 0 ? (
              <MenuItem disabled>未找到模式</MenuItem>
            ) : (
              schemas.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))
            )}
          </TextField>
        )}
        {databaseId !== "" && schema && (
          <Autocomplete
            freeSolo
            options={tables.map((t) => t.value)}
            loading={tablesLoading}
            value={tableName || null}
            inputValue={tableName}
            onInputChange={(_, v) => setTableName(v)}
            onChange={(_, v) => setTableName(v ?? "")}
            renderOption={(props, option) => {
              const t = tables.find((x) => x.value === option);
              return (
                <li {...props} key={option}>
                  {option}
                  {t ? ` (${t.type})` : ""}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="表名称"
                fullWidth
                placeholder="选择或输入表名称"
              />
            )}
          />
        )}
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting || !databaseId || !tableName}
        >
          {submitting ? <CircularProgress size={24} /> : "创建数据集"}
        </Button>
      </Box>
    </Box>
  );
}
