import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataGrid from '@/components/ResponsiveDataGrid';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import { ConfirmModal } from '@/superset-ui-mui/components';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import PageSpeedDial from '@/components/PageSpeedDial';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';
import rison from 'rison';

interface Database {
  id: number;
  database_name: string;
  backend: string;
  expose_in_sqllab: boolean;
  allow_dml: boolean;
  changed_on_delta_humanized: string;
}

interface DatabaseResponse {
  result: Database[];
  count: number;
}

export default function DatabaseList() {
  const [rows, setRows] = useState<Database[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createUri, setCreateUri] = useState('');
  const [creating, setCreating] = useState(false);
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
    registerTools('database_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search databases..." compact sx={{ minWidth: 220 }} />
        ),
      },
      {
        id: 'create',
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <StorageIcon />,
        fabLabel: 'Connect Database',
        action: () => setCreateDialogOpen(true),
        render: null,
      },
    ]);
    return () => unregisterTools('database_list');
  }, [registerTools, unregisterTools, handleSearchChange]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: 'database_name', opr: 'ct', value: searchText }] }),
    });

    api
      .get<DatabaseResponse>(`/database/?q=${qs}`)
      .then(res => {
        setRows(res.data.result ?? []);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(
          err?.response?.data?.message ?? err.message ?? 'Failed to load databases',
        );
        setLoading(false);
      });
  }, [paginationModel, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/database/${deleteTarget.id}`);
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
    { field: 'database_name', headerName: 'Database', flex: 1 },
    {
      field: 'backend',
      headerName: 'Backend',
      flex: 0.4,
      renderCell: params => (
        <Chip label={params.value} size="small" variant="outlined" />
      ),
    },
    {
      field: 'expose_in_sqllab',
      headerName: 'SQL Lab',
      width: 100,
      renderCell: params => (
        <Chip
          label={params.value ? 'Enabled' : 'Disabled'}
          color={params.value ? 'success' : 'default'}
          size="small"
          variant={params.value ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'allow_dml',
      headerName: 'DML',
      width: 100,
      renderCell: params => (
        <Chip
          label={params.value ? 'Yes' : 'No'}
          color={params.value ? 'success' : 'default'}
          size="small"
          variant={params.value ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'changed_on_delta_humanized',
      headerName: 'Last Modified',
      flex: 0.4,
    },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      sortable: false,
      renderCell: params => (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.database_name })}>
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
          icon={<StorageIcon />}
          title="No databases connected"
          description={searchText ? 'Try adjusting your search query' : 'Connect a database to start exploring your data'}
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
          toolbarPageKey="database_list"
          onDelete={row => setDeleteTarget({ id: row.id as number, name: row.database_name as string })}
          onBatchDelete={async ids => { await Promise.all(ids.map(id => api.delete(`/database/${id}`))); fetchData(); }}
          renderCard={row => (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {row.database_name as string}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.25, mt: 0.25 }}>
                <Chip label={row.backend as string} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
                <Chip label={(row.expose_in_sqllab as boolean) ? 'Enabled' : 'Disabled'} size="small" color={(row.expose_in_sqllab as boolean) ? 'success' : 'default'} variant={(row.expose_in_sqllab as boolean) ? 'filled' : 'outlined'} sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
                <Chip label={(row.allow_dml as boolean) ? 'DML: Yes' : 'DML: No'} size="small" color={(row.allow_dml as boolean) ? 'success' : 'default'} variant={(row.allow_dml as boolean) ? 'filled' : 'outlined'} sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>
                  {(row.changed_on_delta_humanized as string) ?? ''}
                </Typography>
              </Box>
            </>
          )}
        />
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Database"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmLoading={deleteLoading}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Connect Database</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Database Name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="SQLAlchemy URI"
            value={createUri}
            onChange={e => setCreateUri(e.target.value)}
            variant="outlined"
            size="small"
            placeholder="postgresql://user:pass@host:port/dbname"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim() || !createUri.trim()}
            onClick={async () => {
              setCreating(true);
              try {
                const res = await api.post('/database/', {
                  database_name: createName.trim(),
                  sqlalchemy_uri: createUri.trim(),
                });
                setCreateDialogOpen(false);
                if (res.data?.id) fetchData();
              } catch { /* ignore */ }
              setCreating(false);
            }}
          >
            {creating ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogActions>
      </Dialog>
      <PageSpeedDial pageKeys="database_list" />
    </Box>
  );
}
