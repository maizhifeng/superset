import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FunctionsIcon from '@mui/icons-material/Functions';
import TableChartIcon from '@mui/icons-material/TableChart';
import type { GridColDef } from '@mui/x-data-grid';
import DataGridTable from '@/components/DataGridTable';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';
import rison from 'rison';

interface DatasetRow {
  id: number;
  table_name: string;
  schema: string | null;
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
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [metricCounts, setMetricCounts] = useState<Record<number, number>>({});
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

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: 'table_name', opr: 'ct', value: searchText }] }),
    });
    api
      .get<DatasetApiResponse>(`/dataset/?q=${qs}`)
      .then(async res => {
        const list = res.data.result;
        setRows(list);
        setRowCount(res.data.count);
        const counts: Record<number, number> = {};
        await Promise.allSettled(
          list.map(item =>
            api.get(`/dataset/${item.id}`)
              .then(detail => { counts[item.id] = (detail.data.result?.metrics?.length ?? 0); })
              .catch(() => { counts[item.id] = 0; }),
          ),
        );
        setMetricCounts(counts);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load datasets');
        setLoading(false);
      });
  }, [paginationModel, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    registerTools('dataset_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search datasets..." compact sx={{ minWidth: 220 }} />
        ),
      },
      {
        id: 'create',
        priority: 10,
        showOnMobile: true,
        render: (
          <Button variant="contained" size="small" onClick={() => navigate('/dataset/create')} sx={{ whiteSpace: 'nowrap' }}>
            Create Dataset
          </Button>
        ),
      },
    ]);
    return () => unregisterTools('dataset_list');
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

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
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'table_name', headerName: 'Table Name', flex: 1 },
    {
      field: 'schema',
      headerName: 'Schema',
      width: 130,
      renderCell: params => {
        const value = params.value;
        if (!value) return null;
        return <Chip label={value} size="small" variant="outlined" />;
      },
    },
    {
      field: 'metric_count',
      headerName: 'Metrics',
      width: 100,
      renderCell: params => {
        const count = metricCounts[params.id as number];
        if (count === undefined) return null;
        return (
          <Chip
            icon={<FunctionsIcon sx={{ fontSize: 14 }} />}
            label={count}
            size="small"
            variant="outlined"
            color={count > 0 ? 'primary' : 'default'}
          />
        );
      },
    },
    {
      field: 'database',
      headerName: 'Database',
      width: 180,
      valueGetter: (_value, row) => row.database?.database_name ?? '',
    },
    {
      field: 'kind',
      headerName: 'Kind',
      width: 110,
      renderCell: params => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === 'physical' ? 'primary' : 'secondary'}
          variant="outlined"
        />
      ),
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', width: 180 },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: params => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit dataset">
            <IconButton
              size="small"
              onClick={e => {
                e.stopPropagation();
                navigate(`/dataset/edit/${params.id}`);
              }}
            >
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.table_name })}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
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
      <Box sx={{ display: { xs: 'block', sm: 'none' }, mb: 2 }}>
        <FilterBar value={searchText} onChange={handleSearchChange} placeholder="Search datasets..." />
      </Box>
      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={<TableChartIcon />}
          title="No datasets found"
          description={searchText ? 'Try adjusting your search query' : 'Create your first dataset to start building charts'}
          action={!searchText ? <Button variant="contained" size="small" onClick={() => navigate('/dataset/create')}>Create Dataset</Button> : undefined}
        />
      ) : (
        <DataGridTable
          rows={rows}
          columns={columns}
          loading={loading}
          autoHeight
          paginationModel={paginationModel}
          rowCount={rowCount}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[25, 50, 100]}
        />
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
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
