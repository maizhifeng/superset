import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import TableChartIcon from '@mui/icons-material/TableChart';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

interface DatasetRow {
  id: number;
  table_name: string;
  sql_metric_count: number;
  database: { database_name: string } | null;
  kind: 'physical' | 'virtual';
  changed_on_delta_humanized: string;
}

interface DatasetApiResponse {
  result: DatasetRow[];
  count: number;
}

export default function DatasetList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DatasetRow[]>([]);
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
      .get<DatasetApiResponse>(`/dataset/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page})`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load datasets');
        setLoading(false);
      });
  }, [paginationModel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/dataset/${deleteTarget.id}`);
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
    { field: 'table_name', headerName: 'Table Name', flex: 1 },
    { field: 'sql_metric_count', headerName: 'Metrics', width: 100 },
    {
      field: 'database',
      headerName: 'Database',
      width: 200,
      valueGetter: (_value, row) => row.database?.database_name ?? '',
    },
    {
      field: 'kind',
      headerName: 'Kind',
      width: 120,
      renderCell: params => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === 'physical' ? 'primary' : 'secondary'}
        />
      ),
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', width: 200 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 60,
      sortable: false,
      renderCell: params => (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.table_name })}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  const actions = (
    <Button variant="contained" size="small" onClick={() => navigate('/dataset/create')}>
      Create Dataset
    </Button>
  );

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Datasets" subtitle="Browse and manage datasets" actions={actions} />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Datasets" subtitle="Browse and manage datasets" actions={actions} />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Datasets" subtitle="Browse and manage datasets" actions={actions} />
      {rows.length === 0 ? (
        <EmptyState
          icon={<TableChartIcon />}
          title="No datasets found"
          description="Create your first dataset to start building charts"
          action={<Button variant="contained" size="small" onClick={() => navigate('/dataset/create')}>Create Dataset</Button>}
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
        title="Delete Dataset"
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
