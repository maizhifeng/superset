import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import PageHeader from '@/components/PageHeader';
import api from '@/api';

interface Database {
  id: number;
  database_name: string;
}

interface DatabaseApiResponse {
  result: Database[];
  count: number;
}

interface TableResult {
  label: string;
  value: string;
}

export default function DatasetCreation() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [tables, setTables] = useState<TableResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [databaseId, setDatabaseId] = useState<number | ''>('');
  const [tableName, setTableName] = useState('');
  const [schema, setSchema] = useState('public');
  const [selectedTable, setSelectedTable] = useState('');

  useEffect(() => {
    api
      .get<DatabaseApiResponse>('/database/?q=(page_size:50,page:0)')
      .then(res => {
        setDatabases(res.data.result);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load databases');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (databaseId === '') {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    api
      .get<{ result: TableResult[] }>(`/database/${databaseId}/tables/`)
      .then(res => {
        setTables(res.data.result);
        setTablesLoading(false);
      })
      .catch(() => {
        setTables([]);
        setTablesLoading(false);
      });
  }, [databaseId]);

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitting(true);

    const payload = {
      table_name: selectedTable || tableName,
      database_id: databaseId,
      schema,
    };

    try {
      await api.post('/dataset/', payload);
      setSubmitSuccess(true);
      setTableName('');
      setSchema('public');
      setDatabaseId('');
      setSelectedTable('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        'Failed to create dataset';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Create Dataset" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
        <TextField
          select
          label="Database"
          value={databaseId}
          onChange={e => setDatabaseId(Number(e.target.value))}
          fullWidth
        >
          {databases.map(db => (
            <MenuItem key={db.id} value={db.id}>
              {db.database_name}
            </MenuItem>
          ))}
        </TextField>
        {databaseId !== '' && (
          <TextField
            select
            label="Table"
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
            fullWidth
            disabled={tablesLoading}
          >
            {tablesLoading ? (
              <MenuItem disabled>Loading...</MenuItem>
            ) : (
              tables.map(t => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))
            )}
          </TextField>
        )}
        <TextField
          label="Table Name"
          value={tableName}
          onChange={e => setTableName(e.target.value)}
          fullWidth
          helperText="Used when not selecting a table above"
        />
        <TextField
          label="Schema"
          value={schema}
          onChange={e => setSchema(e.target.value)}
          fullWidth
        />
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !databaseId || !(selectedTable || tableName)}
        >
          {submitting ? <CircularProgress size={24} /> : 'Create Dataset'}
        </Button>
      </Box>
    </Box>
  );
}
