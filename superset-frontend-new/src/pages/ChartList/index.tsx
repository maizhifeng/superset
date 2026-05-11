import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import BarChartIcon from '@mui/icons-material/BarChart';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

interface ChartRow {
  id: number;
  slice_name: string;
  viz_type: string;
  created_by: { username: string } | null;
  changed_on_delta_humanized: string;
}

interface ChartApiResponse {
  result: ChartRow[];
  count: number;
}

export default function ChartList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChartRow[]>([]);
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
      .get<ChartApiResponse>(`/chart/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page})`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load charts');
        setLoading(false);
      });
  }, [paginationModel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/chart/${deleteTarget.id}`);
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
    { field: 'slice_name', headerName: 'Label', flex: 1 },
    { field: 'viz_type', headerName: 'Type', width: 150 },
    {
      field: 'created_by',
      headerName: 'Created By',
      width: 180,
      valueGetter: (_value, row) => row.created_by?.username ?? '',
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', width: 200 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: params => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => navigate(`/explore?slice_id=${params.id}`)}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.slice_name })}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Charts"
          subtitle="Browse and manage charts"
          actions={<Button variant="contained" size="small" onClick={() => navigate('/explore')}>Create Chart</Button>}
        />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Charts"
          subtitle="Browse and manage charts"
          actions={<Button variant="contained" size="small" onClick={() => navigate('/explore')}>Create Chart</Button>}
        />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Charts"
        subtitle="Browse and manage charts"
        actions={<Button variant="contained" size="small" onClick={() => navigate('/explore')}>Create Chart</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<BarChartIcon />}
          title="No charts found"
          description="Create your first chart to get started"
          action={<Button variant="contained" size="small" onClick={() => navigate('/explore')}>Create Chart</Button>}
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
        title="Delete Chart"
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
