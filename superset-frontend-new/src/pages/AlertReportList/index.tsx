import { useEffect } from 'react';
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
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataGrid from '@/components/ResponsiveDataGrid';
import FilterBar from '@/components/FilterBar';
import ListPageLayout from '@/components/ListPageLayout';
import { ConfirmModal } from '@/superset-ui-mui/components';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';
import { usePaginatedList } from '@/hooks/usePaginatedList';

import type { AlertReport } from '@/types/api';

export default function AlertReportList() {
  const { rows, rowCount, loading, error, searchText, paginationModel, deleteTarget, deleteLoading, deleteError, setPaginationModel, setDeleteTarget, handleSearchChange, handleDelete, fetchData } = usePaginatedList<AlertReport>({ endpoint: '/report/', filterColumn: 'name', errorMessage: 'Failed to load alerts & reports' });
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);

  useEffect(() => {
    registerTools('alert_report_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search alerts..." compact sx={{ minWidth: 220 }} />
        ),
      },
    ]);
    return () => unregisterTools('alert_report_list');
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'type',
      headerName: 'Type',
      flex: 0.4,
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
      width: 100,
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
      flex: 0.4,
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
      width: 80,
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

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyState={
        <EmptyState
          icon={<NotificationsIcon />}
          title="No alerts or reports found"
          description={searchText ? 'Try adjusting your search query' : 'Create an alert or report to get notified when conditions are met'}
        />
      }
    >
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
        toolbarPageKey="alert_report_list"
        onDelete={row => setDeleteTarget({ id: row.id, name: row.name })}
        onBatchDelete={async ids => { await Promise.all(ids.map(id => api.delete(`/report/${id}`))); fetchData(); }}
        renderCard={row => (
          <>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {row.name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.25, mt: 0.25 }}>
              <Chip icon={row.type === 'alert' ? <NotificationsIcon sx={{ fontSize: 10 }} /> : <VerifiedIcon sx={{ fontSize: 10 }} />} label={row.type ? `${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}` : ''} size="small" color={row.type === 'alert' ? 'warning' : 'info'} variant="outlined" sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
              <Chip label={row.active ? 'Active' : 'Inactive'} size="small" color={row.active ? 'success' : 'default'} variant={row.active ? 'filled' : 'outlined'} sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <ScheduleIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>{row.crontab}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <PeopleIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>{row.recipients}</Typography>
              </Box>
            </Box>
          </>
        )}
      />
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
    </ListPageLayout>
  );
}
