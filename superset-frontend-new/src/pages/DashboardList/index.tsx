import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Pagination from '@mui/material/Pagination';
import FilterBar from '@/components/FilterBar';
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
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchLoaded = useRef(false);

  const filterClause = searchText
    ? `,filters:!((col:dashboard_title,opr:contains,value:${searchText}))`
    : '';

  useEffect(() => {
    if (searchLoaded.current) {
      setPage(0);
    }
    searchLoaded.current = true;
  }, [searchText]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    api
      .get<DashboardResponse>(`/dashboard/?q=(page_size:${PAGE_SIZE},page:${page}${filterClause})`)
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
  }, [page, filterClause]);

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
        <PageHeader title="Dashboards" subtitle="Organize and view your dashboards" />
        <FilterBar value={searchText} onChange={setSearchText} placeholder="Search dashboards..." />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
            gap: 2,
            mt: 2,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Paper
              key={i}
              sx={{
                p: 2,
                height: 100,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.6 },
                  '50%': { opacity: 0.3 },
                },
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Dashboards" />
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Box>
    );
  }

  if (dashboards.length === 0 && !loading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Dashboards" subtitle="Organize and view your dashboards" />
        <Box sx={{ mb: 2 }}>
          <FilterBar value={searchText} onChange={setSearchText} placeholder="Search dashboards..." />
        </Box>
        <EmptyState
          icon={<DashboardIcon />}
          title="No dashboards found"
          description={searchText ? 'Try adjusting your search query' : 'Create a dashboard to organize your charts in one place'}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Dashboards" subtitle="Organize and view your dashboards" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <FilterBar value={searchText} onChange={setSearchText} placeholder="Search dashboards..." />
      </Box>
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
        {dashboards.map((dashboard, i) => (
          <Paper
            key={dashboard.id}
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
              '@keyframes cardEnter': {
                from: { opacity: 0, transform: 'translateY(16px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              animation: 'cardEnter 0.35s ease both',
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
        ))}
      </Box>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
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
    </Box>
  );
}
