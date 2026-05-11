import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardIcon from '@mui/icons-material/Dashboard';
import Pagination from '@mui/material/Pagination';
import PageHeader from '@/components/PageHeader';
import { ConfirmModal } from '@/superset-ui-mui/components';
import EmptyState from '@/superset-ui-mui/components/EmptyState';
import api from '@/api';

interface Dashboard {
  id: number;
  dashboard_title: string;
  published: boolean;
  changed_on_delta_humanized?: string;
}

interface DashboardResponse {
  result: Dashboard[];
  count: number;
}

const PAGE_SIZE = 18;

export default function DashboardList() {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    api
      .get<DashboardResponse>(`/dashboard/?q=(page_size:${PAGE_SIZE},page:${page})`)
      .then(res => {
        setDashboards(res.data.result ?? []);
        setTotalCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(
          err?.response?.data?.message ?? err.message ?? 'Failed to load dashboards',
        );
        setLoading(false);
      });
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/dashboard/${deleteTarget.id}`);
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && dashboards.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Dashboards" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Dashboards" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (dashboards.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Dashboards" />
        <EmptyState
          icon={<DashboardIcon />}
          title="No dashboards found"
          description="Create a dashboard to get started"
        />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Dashboards" />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            lg: '1fr 1fr 1fr',
          },
          gap: 2,
        }}
      >
        {dashboards.map(dashboard => (
          <Paper
            key={dashboard.id}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              cursor: 'pointer',
              position: 'relative',
              transition: 'box-shadow 0.3s ease, transform 0.3s ease',
              '&:hover': {
                boxShadow: 4,
                '& .delete-btn': { opacity: 1 },
              },
              '@keyframes fadeInUp': {
                from: { opacity: 0, transform: 'translateY(12px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              animation: 'fadeInUp 0.4s ease',
            }}
            onClick={() => navigate(`/dashboard/${dashboard.id}`)}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                {dashboard.dashboard_title}
              </Typography>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  className="delete-btn"
                  sx={{ opacity: 0, transition: 'opacity 0.2s', mt: -0.5, mr: -0.5 }}
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget({ id: dashboard.id, name: dashboard.dashboard_title });
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
            {dashboard.published && (
              <Badge color="success" badgeContent="published" sx={{ mb: 0.5 }} />
            )}
            {dashboard.changed_on_delta_humanized && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {dashboard.changed_on_delta_humanized}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            color="primary"
          />
        </Box>
      )}
      {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
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
    </Box>
  );
}
