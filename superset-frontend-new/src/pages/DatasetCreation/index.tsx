import { useState, useEffect } from "react";
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

  const [databaseId, setDatabaseId] = useState<number | "">("");
  const [schema, setSchema] = useState("");
  const [tableName, setTableName] = useState("");

  useEffect(() => {
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:50,page:0)")
      .then((res) => {
        setDatabases(res.data.result);
        setLoading(false);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, "Failed to load databases"));
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
      await api.post("/dataset/", payload);
      setSubmitSuccess(true);
      setTableName("");
      setSchema("");
      setDatabaseId("");
    } catch (err: unknown) {
      setSubmitError(parseErrorMessage(err, "Failed to create dataset"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Create Dataset" />
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Create Dataset" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Create Dataset" />
      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Dataset created successfully
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
          label="Database"
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
            label="Schema"
            value={schema}
            onChange={(e) => {
              setSchema(e.target.value);
              setTableName("");
            }}
            fullWidth
            disabled={schemasLoading}
          >
            {schemasLoading ? (
              <MenuItem disabled>Loading...</MenuItem>
            ) : schemas.length === 0 ? (
              <MenuItem disabled>No schemas found</MenuItem>
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
            inputValue={tableName}
            onInputChange={(_, v) => setTableName(v)}
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
                label="Table Name"
                fullWidth
                placeholder="Select or type a table name"
              />
            )}
          />
        )}
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !databaseId || !tableName}
        >
          {submitting ? <CircularProgress size={24} /> : "Create Dataset"}
        </Button>
      </Box>
    </Box>
  );
}
