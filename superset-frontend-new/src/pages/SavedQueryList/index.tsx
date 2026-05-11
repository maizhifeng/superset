import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<SavedQueryApiResponse>(`/saved_query/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page})`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load saved queries');
        setLoading(false);
      });
  }, [paginationModel]);

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
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'label', headerName: 'Label', flex: 1 },
    {
      field: 'sql',
      headerName: 'SQL',
      flex: 2,
      renderCell: params => {
        const sql = params.value ?? '';
        return sql.length > 80 ? `${sql.slice(0, 80)}...` : sql;
      },
    },
    {
      field: 'database',
      headerName: 'Database',
      width: 180,
      valueGetter: (_value, row) => row.database?.database_name ?? '',
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', width: 200 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 60,
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
      <Box sx={{ p: 3 }}>
        <PageHeader title="Saved Queries" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Saved Queries" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Saved Queries" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<SaveIcon />}
          title="No saved queries found"
          description="Save a query from SQL Lab to see it here"
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
