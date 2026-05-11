import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsIcon from '@mui/icons-material/Notifications';
import VerifiedIcon from '@mui/icons-material/Verified';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PeopleIcon from '@mui/icons-material/People';
import type { GridColDef } from '@mui/x-data-grid';
import DataGridTable from '@/components/DataGridTable';
import FilterBar from '@/components/FilterBar';
import TableSkeleton from '@/components/TableSkeleton';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

interface AlertReport {
  id: number;
  name: string;
  type: string;
  active: boolean;
  crontab: string;
  recipients: string;
}

interface AlertReportApiResponse {
  result: AlertReport[];
  count: number;
}

export default function AlertReportList() {
  const [rows, setRows] = useState<AlertReport[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const searchLoaded = useRef(false);

  const filterClause = searchText
    ? `,filters:!((col:name,opr:contains,value:${searchText}))`
    : '';

  useEffect(() => {
    if (searchLoaded.current) {
      setPaginationModel(prev => ({ ...prev, page: 0 }));
    }
    searchLoaded.current = true;
  }, [searchText]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<AlertReportApiResponse>(`/report/?q=(page_size:${paginationModel.pageSize},page:${paginationModel.page}${filterClause})`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load alerts & reports');
        setLoading(false);
      });
  }, [paginationModel, filterClause]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/report/${deleteTarget.id}`);
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
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'type',
      headerName: 'Type',
      width: 130,
      renderCell: params => (
        <Chip
          icon={params.value === 'alert' ? <NotificationsIcon sx={{ fontSize: 14 }} /> : <VerifiedIcon sx={{ fontSize: 14 }} />}
          label={params.value ? params.value.charAt(0).toUpperCase() + params.value.slice(1) : ''}
          size="small"
          color={params.value === 'alert' ? 'warning' : 'info'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'active',
      headerName: 'Status',
      width: 110,
      renderCell: params => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          color={params.value ? 'success' : 'default'}
          variant={params.value ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'crontab',
      headerName: 'Schedule',
      width: 160,
      renderCell: params => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ScheduleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          <span>{params.value}</span>
        </Box>
      ),
    },
    {
      field: 'recipients',
      headerName: 'Recipients',
      flex: 1,
      renderCell: params => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PeopleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          <span>{params.value}</span>
        </Box>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: params => (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => setDeleteTarget({ id: params.id as number, name: params.row.name })}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Alerts & Reports" />
        <FilterBar value={searchText} onChange={setSearchText} placeholder="Search alerts..." />
        <Box sx={{ mt: 2 }}><TableSkeleton /></Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Alerts & Reports" />
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Alerts & Reports" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <FilterBar value={searchText} onChange={setSearchText} placeholder="Search alerts..." />
      </Box>
      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={<NotificationsIcon />}
          title="No alerts or reports found"
          description={searchText ? 'Try adjusting your search query' : 'Create an alert or report to get notified when conditions are met'}
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
        title="Delete Alert/Report"
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
