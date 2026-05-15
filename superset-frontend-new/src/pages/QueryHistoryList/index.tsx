import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import HistoryIcon from '@mui/icons-material/History';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataGrid from '@/components/ResponsiveDataGrid';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import api from '@/api';
import rison from 'rison';

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

const MAX_DURATION_MS = 300000;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function durationColor(ms: number): string {
  if (ms < 1000) return '#5ac189';
  if (ms < 10000) return '#20a7c9';
  if (ms < 60000) return '#ff7f44';
  return '#e0432e';
}

export default function QueryHistoryList() {
  const [rows, setRows] = useState<QueryLog[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const searchLoaded = useRef(false);
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);

  useEffect(() => {
    if (searchLoaded.current) {
      setPaginationModel(prev => ({ ...prev, page: 0 }));
    }
    searchLoaded.current = true;
  }, [searchText]);

  const handleSearchChange = useCallback((v: string) => {
    setSearchText(v);
  }, []);

  useEffect(() => {
    registerTools('query_history_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search queries..." compact sx={{ minWidth: 220 }} />
        ),
      },
    ]);
    return () => unregisterTools('query_history_list');
  }, [registerTools, unregisterTools, handleSearchChange]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: 'action', opr: 'ct', value: searchText }] }),
    });
    api
      .get<QueryLogApiResponse>(`/log/?q=${qs}`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load query history');
        setLoading(false);
      });
  }, [paginationModel, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    {
      field: 'user',
      headerName: 'User',
      flex: 0.4,
      renderCell: params => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AccountCircleIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          <span>{params.row.user?.username ?? ''}</span>
        </Box>
      ),
    },
    { field: 'action', headerName: 'Action', flex: 1 },
    {
      field: 'dttm',
      headerName: 'Date',
      flex: 0.5,
      valueGetter: (_value, row) => {
        if (!row.dttm) return '';
        return new Date(row.dttm).toLocaleString();
      },
    },
    {
      field: 'duration_ms',
      headerName: 'Duration',
      flex: 0.4,
      renderCell: params => {
        const ms = params.row.duration_ms;
        const pct = Math.min((ms / MAX_DURATION_MS) * 100, 100);
        return (
          <Tooltip title={`${formatDuration(ms)} (${ms}ms)`} arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 2 }}>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: 'rgba(0,0,0,0.06)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: durationColor(ms),
                    borderRadius: 3,
                  },
                }}
              />
              <Typography variant="caption" sx={{ fontWeight: 500, whiteSpace: 'nowrap', minWidth: 50, textAlign: 'right' }}>
                {formatDuration(ms)}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
  ];

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        <Box sx={{ mt: 2 }}><TableSkeleton /></Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, pt: 2 }}>

      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={<HistoryIcon />}
          title="No query history found"
          description={searchText ? 'Try adjusting your search query' : 'Run queries in SQL Lab to see your history here'}
        />
      ) : (
        <ResponsiveDataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          autoHeight
          paginationModel={paginationModel}
          rowCount={rowCount}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[25, 50, 100]}
          renderCard={row => {
            const ms = row.duration_ms as number;
            const pct = Math.min((ms / MAX_DURATION_MS) * 100, 100);
            return (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontFamily: 'monospace', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.action as string}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                      <AccountCircleIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>
                        {((row.user as Record<string, unknown>)?.['username'] as string) ?? 'N/A'}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.dttm ? new Date(row.dttm as string).toLocaleString() : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <LinearProgress variant="determinate" value={pct} sx={{ width: 40, height: 3, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.06)', '& .MuiLinearProgress-bar': { bgcolor: durationColor(ms), borderRadius: 2 } }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.6rem', color: durationColor(ms) }}>
                      {formatDuration(ms)}
                    </Typography>
                  </Box>
                </Box>
              </>
            );
          }}
        />
      )}
    </Box>
  );
}
