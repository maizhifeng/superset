import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    api
      .get<DatabaseResponse>(`/database/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page})`)
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
  }, [paginationModel]);

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
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'database_name', headerName: 'Database', flex: 1 },
    { field: 'backend', headerName: 'Backend', width: 150 },
    {
      field: 'expose_in_sqllab',
      headerName: 'SQL Lab',
      width: 120,
      renderCell: params => (
        <Chip
          label={params.value ? 'Yes' : 'No'}
          color={params.value ? 'success' : 'default'}
          size="small"
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
        />
      ),
    },
    {
      field: 'changed_on_delta_humanized',
      headerName: 'Last Modified',
      width: 200,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 60,
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
      <Box sx={{ p: 3 }}>
        <PageHeader title="Databases" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Databases" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Databases" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<StorageIcon />}
          title="No databases connected"
          description="Connect a database to start exploring your data"
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
      {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
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
    </Box>
  );
}
