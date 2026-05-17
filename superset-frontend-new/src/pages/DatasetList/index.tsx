import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FunctionsIcon from '@mui/icons-material/Functions';
import TableChartIcon from '@mui/icons-material/TableChart';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataGrid from '@/components/ResponsiveDataGrid';
import FilterBar from '@/components/FilterBar';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import PageSpeedDial from '@/components/PageSpeedDial';
import ListPageLayout from '@/components/ListPageLayout';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';
import { usePaginatedList } from '@/hooks/usePaginatedList';

import type { DatasetRow } from '@/types/api';

export default function DatasetList() {
  const navigate = useNavigate();
  const { rows, rowCount, loading, error, searchText, paginationModel, deleteTarget, deleteLoading, deleteError, setPaginationModel, setDeleteTarget, handleSearchChange, handleDelete, fetchData } = usePaginatedList<DatasetRow>({ endpoint: '/dataset/', filterColumn: 'table_name', pageSize: 25, errorMessage: 'Failed to load datasets' });
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);

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
        primary: true,
        fabIcon: <FunctionsIcon />,
        fabLabel: 'New Dataset',
        action: () => navigate('/dataset/create'),
        render: null,
      },
    ]);
    return () => unregisterTools('dataset_list');
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'table_name', headerName: 'Table Name', flex: 1, minWidth: 120 },
    {
      field: 'schema', headerName: 'Schema', flex: 0.5, minWidth: 80,
      renderCell: params => {
        const value = params.value;
        if (!value) return null;
        return <Chip label={value} size="small" variant="outlined" />;
      },
    },
    {
      field: 'database', headerName: 'Database', flex: 0.7, minWidth: 100,
      valueGetter: (_value, row) => row.database?.database_name ?? '',
    },
    { field: 'changed_on_delta_humanized', headerName: 'Last Modified', flex: 0.6, minWidth: 100 },
    {
      field: 'kind', headerName: 'Kind', flex: 0.4, minWidth: 80,
      renderCell: params => (
        <Chip label={params.value} size="small" color={params.value === 'physical' ? 'primary' : 'secondary'} variant="outlined" />
      ),
    },
    {
      field: 'actions', headerName: '', width: 80, sortable: false,
      renderCell: params => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit dataset">
            <IconButton size="small" onClick={e => { e.stopPropagation(); navigate(`/dataset/edit/${params.id}`); }}>
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

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyState={
        <EmptyState
          icon={<TableChartIcon />}
          title="No datasets found"
          description={searchText ? 'Try adjusting your search query' : 'Create your first dataset to start building charts'}
          action={!searchText ? <Button variant="contained" size="small" onClick={() => navigate('/dataset/create')}>Create Dataset</Button> : undefined}
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
          onRowClick={params => navigate(`/dataset/edit/${params.id}`)}
          onEdit={row => navigate(`/dataset/edit/${row.id as number}`)}
          toolbarPageKey="dataset_list"
          onDelete={row => setDeleteTarget({ id: row.id, name: row.table_name })}
          onBatchDelete={async ids => { await Promise.all(ids.map(id => api.delete(`/dataset/${id}`))); fetchData(); }}
          renderCard={row => (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {row.table_name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.25, mt: 0.25 }}>
                {row.schema && <Chip label={row.schema} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />}
                <Chip label={row.kind} size="small" color={row.kind === 'physical' ? 'primary' : 'secondary'} variant="outlined" sx={{ height: 16, fontSize: '0.55rem', '& .MuiChip-label': { px: 0.5 } }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                  {row.database?.database_name ?? 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>
                  {row.changed_on_delta_humanized ?? ''}
                </Typography>
              </Box>
            </>
          )}
        />
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
      <PageSpeedDial pageKeys="dataset_list" />
    </ListPageLayout>
  );
}
