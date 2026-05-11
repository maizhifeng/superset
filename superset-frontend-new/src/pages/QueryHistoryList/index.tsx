import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import HistoryIcon from '@mui/icons-material/History';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

interface QueryLog {
  id: number;
  user: { username: string } | null;
  action: string;
  dttm: string;
  duration_ms: number;
}

interface QueryLogApiResponse {
  result: QueryLog[];
  count: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function QueryHistoryList() {
  const [rows, setRows] = useState<QueryLog[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<QueryLogApiResponse>(`/log/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page})`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load query history');
        setLoading(false);
      });
  }, [paginationModel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    {
      field: 'user',
      headerName: 'User',
      width: 150,
      valueGetter: (_value, row) => row.user?.username ?? '',
    },
    { field: 'action', headerName: 'Action', flex: 1 },
    {
      field: 'dttm',
      headerName: 'Date',
      width: 200,
      valueGetter: (_value, row) => {
        if (!row.dttm) return '';
        return new Date(row.dttm).toLocaleString();
      },
    },
    {
      field: 'duration_ms',
      headerName: 'Duration',
      width: 120,
      valueGetter: (_value, row) => formatDuration(row.duration_ms),
    },
  ];

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Query History" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Query History" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Query History" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title="No query history found"
          description="Run queries in SQL Lab to see your history here"
        />
      ) : (
        <DataGrid
          rows={rows}
          columns={columns}
          autoHeight
          paginationModel={paginationModel}
          rowCount={rowCount}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[25, 50, 100]}
        />
      )}
    </Box>
  );
}
