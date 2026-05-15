import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import Typography from '@mui/material/Typography';
import CodeIcon from '@mui/icons-material/Code';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataGrid from '@/components/ResponsiveDataGrid';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import { ConfirmModal } from '@/superset-ui-mui/components';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';
import rison from 'rison';

interface SavedQuery {
  id: number;
  label: string;
  sql: string;
  database: { database_name: string } | null;
  changed_on_delta_humanized: string;
}

interface SavedQueryApiResponse {
  result: SavedQuery[];
  count: number;
}

export default function SavedQueryList() {
  const [rows, setRows] = useState<SavedQuery[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    registerTools('saved_query_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search saved queries..." compact sx={{ minWidth: 220 }} />
        ),
      },
    ]);
    return () => unregisterTools('saved_query_list');
  }, [registerTools, unregisterTools, handleSearchChange]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: 'label', opr: 'ct', value: searchText }] }),
    });
    api
      .get<SavedQueryApiResponse>(`/saved_query/?q=${qs}`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load saved queries');
        setLoading(false);
      });
  }, [paginationModel, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/saved_query/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setDeleteError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          || (err instanceof Error ? err.message : 'Delete failed'),
      );
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    {
      field: 'label',
      headerName: 'Label',
      flex: 1,
      renderCell: params => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'sql',
      headerName: 'SQL Preview',
      flex: 2,
      renderCell: params => {
        const sql = params.value ?? '';
        const truncated = sql.length > 100 ? `${sql.slice(0, 100)}...` : sql;
        return (
          <Tooltip title={<Box component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 500, whiteSpace: 'pre-wrap', m: 0 }}>{sql}</Box>} placement="left" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
              <CodeIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {truncated}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'database',
      headerName: 'Database',
      flex: 0.4,
      valueGetter: (_value, row) => row.database?.database_name ?? '',
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', flex: 0.4 },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      sortable: false,
      renderCell: params => (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.label })}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ),
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
          icon={<SaveIcon />}
          title="No saved queries found"
          description={searchText ? 'Try adjusting your search query' : 'Save a query from SQL Lab to see it here'}
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
          toolbarPageKey="saved_query_list"
          onDelete={row => setDeleteTarget({ id: row.id as number, name: row.label as string })}
          onBatchDelete={async ids => { await Promise.all(ids.map(id => api.delete(`/saved_query/${id}`))); fetchData(); }}
          renderCard={row => (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {row.label as string}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 0.25, mt: 0.25, overflow: 'hidden' }}>
                <CodeIcon sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {((row.sql as string)?.length ?? 0) > 60 ? `${(row.sql as string).slice(0, 60)}...` : (row.sql as string)}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem', flexShrink: 0 }}>
                  {((row.database as Record<string, unknown>)?.['database_name'] as string) ?? ''}
                  {(row.changed_on_delta_humanized as string) ? ` · ${row.changed_on_delta_humanized}` : ''}
                </Typography>
              </Box>
            </>
          )}
        />
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Saved Query"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmLoading={deleteLoading}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
