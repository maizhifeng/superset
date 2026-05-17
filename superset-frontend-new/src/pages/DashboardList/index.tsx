import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Pagination from '@mui/material/Pagination';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import FilterBar from '@/components/FilterBar';
import ListPageLayout from '@/components/ListPageLayout';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import PageSpeedDial from '@/components/PageSpeedDial';
import { ConfirmModal, Grid2 } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import EmptyStateShortcutHint from '@/components/EmptyStateShortcutHint';
import { cardEnter } from '@/theme/keyframes';
import api from '@/api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import type { DashboardListItem } from '@/types/api';

const PAGE_SIZE = 18;

export default function DashboardList() {
  const navigate = useNavigate();
  const {
    rows: dashboards, rowCount, loading, error, searchText, paginationModel,
    deleteTarget, deleteLoading, deleteError,
    setPaginationModel, setDeleteTarget, handleSearchChange, handleDelete,
  } = usePaginatedList<DashboardListItem>({
    endpoint: '/dashboard/',
    filterColumn: 'dashboard_title',
    pageSize: PAGE_SIZE,
    errorMessage: 'Failed to load dashboards',
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('New Dashboard');
  const [creating, setCreating] = useState(false);
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);

  useEffect(() => {
    registerTools('dashboard_list', [
      {
        id: 'search',
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar value="" onChange={handleSearchChange} placeholder="Search dashboards..." compact sx={{ minWidth: 220 }} />
        ),
      },
      {
        id: 'create',
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <DashboardIcon />,
        fabLabel: 'New Dashboard',
        action: () => setCreateDialogOpen(true),
        render: null,
      },
    ]);
    return () => unregisterTools('dashboard_list');
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

  const totalPages = Math.ceil(rowCount / PAGE_SIZE);

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={dashboards.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<DashboardIcon />}
            title="No dashboards found"
            description={searchText ? 'Try adjusting your search query' : 'Create a dashboard to organize your charts in one place'}
          />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <Grid2 container spacing={2}>
        {dashboards.map((dashboard, i) => (
          <Grid2 size={{ xs: 12, sm: 6, lg: 4 }} key={dashboard.id}>
          <Paper
            sx={{
              p: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              cursor: 'pointer',
              position: 'relative',
              transition: 'box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1), transform 250ms cubic-bezier(0.4, 0, 0.2, 1), border-color 250ms ease',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                transform: 'translateY(-2px)',
                borderColor: 'primary.light',
                '& .card-actions': { opacity: 1 },
              },
              animation: `${cardEnter} 0.35s ease both`,
              animationDelay: `${i * 0.04}s`,
            }}
            onClick={() => navigate(`/dashboard/${dashboard.id}`)}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.3 }}>
                {dashboard.dashboard_title}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {dashboard.published ? (
                <Chip label="Published" size="small" color="success" variant="outlined" sx={{ height: 22, '& .MuiChip-label': { fontSize: '0.65rem', px: 0.75 } }} />
              ) : (
                <Chip label="Draft" size="small" variant="outlined" sx={{ height: 22, '& .MuiChip-label': { fontSize: '0.65rem', px: 0.75 } }} />
              )}
              {dashboard.changed_on_delta_humanized && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <CalendarTodayIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {dashboard.changed_on_delta_humanized}
                  </Typography>
                </Box>
              )}
            </Box>
            <Box
              className="card-actions"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                opacity: 0,
                transition: 'opacity 200ms ease',
              }}
            >
              <Tooltip title="Open dashboard">
                <IconButton
                  size="small"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/dashboard/${dashboard.id}`);
                  }}
                  sx={{ bgcolor: 'background.paper', boxShadow: 1, mr: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <VisibilityIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget({ id: dashboard.id, name: dashboard.dashboard_title });
                  }}
                  sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'error.light' } }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Paper>
          </Grid2>
        ))}
      </Grid2>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, pr: { xs: 7, sm: 0 } }}>
          <Pagination
            count={totalPages}
            page={paginationModel.page + 1}
            onChange={(_, p) => setPaginationModel({ ...paginationModel, page: p - 1 })}
            color="primary"
            shape="rounded"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{deleteError}</Alert>}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Dashboard"
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
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Create Dashboard</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Dashboard Name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim()}
            onClick={async () => {
              setCreating(true);
              try {
                const res = await api.post('/dashboard/', { dashboard_title: createName.trim() });
                const newId = res.data?.id;
                setCreateDialogOpen(false);
                if (newId) navigate(`/dashboard/${newId}`);
              } catch { /* ignore */ }
              setCreating(false);
            }}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      <PageSpeedDial pageKeys="dashboard_list" />
    </ListPageLayout>
  );
}
