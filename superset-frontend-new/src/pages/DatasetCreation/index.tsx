import { useState, useEffect, type ReactNode } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import api from "@/api";
import rison from "rison";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { Database, TableResult } from "@/types/api";

interface StepSectionProps {
  index: number;
  title: string;
  /** False renders the step as "not reachable yet" (muted number + title). */
  available: boolean;
  children: ReactNode;
}

/** One numbered step of the creation flow. */
function StepSection({ index, title, available, children }: StepSectionProps) {
  return (
    <Box
      component="li"
      sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
    >
      <Box
        aria-hidden
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          flexShrink: 0,
          mt: "2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 700,
          bgcolor: available ? "primary.main" : "grey.100",
          color: available ? "primary.contrastText" : "text.disabled",
        }}
      >
        {index}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h2"
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            color: available ? "text.primary" : "text.secondary",
            mb: 1,
          }}
        >
          {title}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

/** Centered, width-capped card that hosts the whole creation flow. */
function CreationCard({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        p: { xs: 2, md: 3 },
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 840, py: { xs: 1, md: 4 } }}>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>{children}</CardContent>
        </Card>
      </Box>
    </Box>
  );
}

/** Page title plus a one-line explanation of the flow. */
function CreationHeader() {
  return (
    <>
      <Typography
        component="h1"
        variant="h5"
        sx={{ fontWeight: 700, letterSpacing: "-0.25px" }}
      >
        创建数据集
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        依次选择数据库、模式和表，即可把一张物理表注册为数据集；创建后可继续配置数据列与指标。
      </Typography>
    </>
  );
}

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
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <CreationCard>
        <CreationHeader />
        <Alert severity="error" sx={{ mt: 3, borderRadius: 1.5 }}>
          {error}
        </Alert>
      </CreationCard>
    );
  }

  const hasDatabase = databaseId !== "";
  // Some engines (e.g. schema-less PostgreSQL setups) return no schemas; the
  // flow must still allow creating a physical dataset by typing a table name.
  const schemaRequired = !schemasLoading && schemas.length > 0;
  const hasSchema = schema !== "" || (hasDatabase && !schemaRequired);
  const isComplete = hasDatabase && hasSchema && tableName !== "";
  const missing = [
    !hasDatabase ? "数据库" : null,
    schemaRequired && !schema ? "模式" : null,
    !isComplete ? "数据表" : null,
  ].filter((label): label is string => label !== null);
  const missingHint =
    missing.length === 0
      ? "确认无误后即可创建，创建后可继续配置数据列与指标"
      : `还需选择${missing.join("、")}`;
  const tableHelperText = tablesLoading
    ? "正在加载数据表…"
    : tables.length === 0
      ? "未找到数据表，可直接输入表名"
      : "可从列表选择，也可直接输入表名";

  return (
    <CreationCard>
      <CreationHeader />
      <Divider sx={{ my: 3 }} />
      {submitSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 3, borderRadius: 1.5 }}
          action={
            createdId != null ? (
              <Button
                size="small"
                color="inherit"
                onClick={() => navigate(`/dataset/edit/${createdId}`)}
              >
                编辑数据集
              </Button>
            ) : undefined
          }
        >
          数据集创建成功
          {createdId != null ? `（ID ${createdId}）` : ""}
        </Alert>
      )}
      {submitError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 1.5 }}>
          {submitError}
        </Alert>
      )}
      <Box
        component="ol"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <StepSection index={1} title="选择数据库" available>
          <TextField
            select
            size="small"
            fullWidth
            label="数据库"
            value={databaseId}
            helperText="数据集将沿用该数据库的连接与权限配置"
            onChange={(e) => {
              setDatabaseId(Number(e.target.value));
              setTableName("");
            }}
          >
            {databases.map((db) => (
              <MenuItem key={db.id} value={db.id}>
                {db.database_name}
              </MenuItem>
            ))}
          </TextField>
        </StepSection>
        <StepSection index={2} title="选择模式" available={hasDatabase}>
          {hasDatabase && !schemasLoading && schemas.length === 0 ? (
            <TextField
              size="small"
              fullWidth
              disabled
              label="模式"
              value="无需模式"
              helperText="该数据库无需选择模式，可直接进入下一步"
            />
          ) : hasDatabase ? (
            <TextField
              select
              size="small"
              fullWidth
              label="模式"
              value={schema}
              disabled={schemasLoading}
              helperText={
                schemasLoading ? "正在加载模式…" : "选择数据表所在的模式"
              }
              onChange={(e) => {
                setSchema(e.target.value);
                setTableName("");
              }}
            >
              {schemasLoading ? (
                <MenuItem disabled value="">
                  加载中…
                </MenuItem>
              ) : (
                schemas.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))
              )}
            </TextField>
          ) : (
            <TextField
              size="small"
              fullWidth
              disabled
              label="模式"
              value=""
              helperText="请先选择数据库"
            />
          )}
        </StepSection>
        <StepSection
          index={3}
          title="选择数据表"
          available={hasDatabase && hasSchema}
        >
          {hasDatabase && hasSchema ? (
            <Autocomplete
              freeSolo
              size="small"
              options={tables.map((t) => t.value)}
              loading={tablesLoading}
              noOptionsText="没有匹配的数据表"
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
                  label="数据表"
                  fullWidth
                  placeholder="选择或输入表名称"
                  helperText={tableHelperText}
                />
              )}
            />
          ) : (
            <TextField
              size="small"
              fullWidth
              disabled
              label="数据表"
              value=""
              helperText="请先选择模式"
            />
          )}
        </StepSection>
      </Box>
      <Box
        sx={{
          mt: 4,
          pt: 2.5,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", flex: "1 1 240px" }}
        >
          {missingHint}
        </Typography>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting || !isComplete}
          startIcon={
            submitting ? <CircularProgress size={16} color="inherit" /> : null
          }
          sx={{ minWidth: 160 }}
        >
          {submitting ? "创建中…" : "创建数据集"}
        </Button>
      </Box>
    </CreationCard>
  );
}
