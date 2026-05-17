import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import PageHeader from '@/components/PageHeader';
import { useState, useEffect, useCallback } from 'react';
import { parseErrorMessage } from '@/utils/parseErrorMessage';
import api from '@/api';
import type { Database, QueryResult } from '@/types/api';

export default function SqlLab() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [databaseId, setDatabaseId] = useState<number | ''>('');
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:100,page:0)")
      .then(res => {
        setDatabases(res.data.result);
      })
      .catch(() => {
        setError('Failed to load databases');
      });
  }, []);

  const handleRun = useCallback(async () => {
    if (databaseId === '' || !sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<QueryResult>('/sqllab/execute/', {
        database_id: databaseId,
        sql,
      });
      setResult(res.data);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, 'An error occurred while executing the query'));
    } finally {
      setLoading(false);
    }
  }, [databaseId, sql]);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="SQL Lab" />
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl size="small" sx={{ maxWidth: 300 }}>
            <InputLabel id="database-select-label">Database</InputLabel>
            <Select
              labelId="database-select-label"
              label="Database"
              value={databaseId}
              onChange={e => setDatabaseId(e.target.value as number)}
            >
              {databases.map(db => (
                <MenuItem key={db.id} value={db.id}>
                  {db.database_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="SQL"
            multiline
            rows={8}
            value={sql}
            onChange={e => setSql(e.target.value)}
            sx={{ fontFamily: 'monospace' }}
            slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleRun}
              disabled={loading || databaseId === '' || !sql.trim()}
            >
              {loading ? <CircularProgress size={20} /> : 'Run'}
            </Button>
          </Box>
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {result && result.columns && result.columns.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {result.columns.map(col => (
                  <TableCell key={col.name}>{col.name}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {result.data.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map(col => (
                    <TableCell key={col.name}>{String(row[col.name] ?? '')}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
