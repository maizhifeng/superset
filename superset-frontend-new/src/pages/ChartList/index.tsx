import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BarChartIcon from '@mui/icons-material/BarChart';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import type { GridColDef, GridRowParams } from '@mui/x-data-grid';
import DataGridTable from '@/components/DataGridTable';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import api from '@/api';
import rison from 'rison';

interface ChartRow {
  id: number;
  slice_name: string;
  viz_type: string;
  created_by: { username: string } | null;
  changed_on_delta_humanized: string;
  datasource_name_text?: string;
  datasource_type?: string;
  datasource_id?: number;
  table?: { table_name: string };
}

interface ChartApiResponse {
  result: ChartRow[];
  count: number;
}

const vizTypeLabels: Record<string, string> = {
  line: 'Line Chart',
  bar: 'Bar Chart',
  table: 'Table',
  pie: 'Pie Chart',
  histogram: 'Histogram',
  scatter: 'Scatter Plot',
  big_number: 'Big Number',
  big_number_total: 'Big Number Total',
  time_table: 'Time Table',
  box_plot: 'Box Plot',
  treemap: 'Treemap',
  heatmap: 'Heatmap',
  word_cloud: 'Word Cloud',
  sunburst: 'Sunburst',
  sankey: 'Sankey',
  map: 'Map',
  deckgl: 'Deck.gl',
};

export default function ChartList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChartRow[]>([]);
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

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: 'slice_name', opr: 'ct', value: searchText }] }),
    });
    api
      .get<ChartApiResponse>(`/chart/?q=${qs}`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load charts');
        setLoading(false);
      });
  }, [paginationModel, searchText]);

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
    registerTools('chart_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search charts..." compact sx={{ minWidth: 220 }} />
        ),
      },
      {
        id: 'create',
        priority: 10,
        showOnMobile: true,
        render: (
          <Button variant="contained" size="small" onClick={() => navigate('/explore')} sx={{ whiteSpace: 'nowrap' }}>
            Create Chart
          </Button>
        ),
      },
    ]);
    return () => unregisterTools('chart_list');
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

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
    { field: 'id', headerName: 'ID', width: 70 },
    {
      field: 'slice_name',
      headerName: 'Chart Name',
      flex: 1,
      renderCell: params => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'viz_type',
      headerName: 'Type',
      width: 160,
      renderCell: params => (
        <Chip
          label={vizTypeLabels[params.value] || params.value}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: 'datasource_name_text',
      headerName: 'Dataset',
      width: 220,
      valueGetter: (_value, row) => row.datasource_name_text || row.table?.table_name || '',
      renderCell: params => {
        const name = params.value;
        const id = params.row.datasource_id;
        if (!name && !id) return null;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TableChartOutlinedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
            <Link
              component="button"
              variant="body2"
              underline="hover"
              onClick={e => {
                e.stopPropagation();
                if (id) {
                  navigate(`/dataset/list?datasource_id=${id}`);
                }
              }}
              sx={{ fontSize: '0.8125rem', textAlign: 'left' }}
            >
              {name}
            </Link>
          </Box>
        );
      },
    },
    {
      field: 'created_by',
      headerName: 'Created By',
      width: 160,
      valueGetter: (_value, row) => row.created_by?.username ?? '',
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', width: 180 },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: params => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit chart">
            <IconButton size="small" onClick={e => { e.stopPropagation(); navigate(`/explore?slice_id=${params.id}`); }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <IconButton size="small" onClick={e => { e.stopPropagation(); window.open(`/explore?slice_id=${params.id}`, '_blank'); }}>
              <OpenInNewIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={e => { e.stopPropagation(); setDeleteTarget({ id: params.id as number, name: params.row.slice_name }); }}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const handleRowClick = (params: GridRowParams) => {
    navigate(`/explore?slice_id=${params.id}`);
  };

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
        <FilterBar value={searchText} onChange={handleSearchChange} placeholder="Search charts..." />
      </Box>
      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={<BarChartIcon />}
          title="No charts found"
          description={searchText ? 'Try adjusting your search query' : 'Create your first chart to get started with data visualization'}
          action={!searchText ? <Button variant="contained" size="small" onClick={() => navigate('/explore')}>Create Chart</Button> : undefined}
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
          onRowClick={handleRowClick}
        />
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
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
