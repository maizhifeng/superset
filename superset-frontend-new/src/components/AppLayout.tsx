import { type ReactNode, useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import BarChartIcon from '@mui/icons-material/BarChart';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import CodeIcon from '@mui/icons-material/Code';
import Logout from '@mui/icons-material/Logout';
import Settings from '@mui/icons-material/Settings';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuSettings } from '@/store/menuSettings';
import api from '@/api';

interface CrumbItem {
  label: string;
  path: string;
  isId: boolean;
  options?: { label: string; path: string }[];
}

const knownSections: Record<string, { label: string; listPath: string }> = {
  dashboard: { label: 'Dashboard', listPath: '/dashboard/list' },
  chart: { label: 'Chart', listPath: '/chart/list' },
  dataset: { label: 'Dataset', listPath: '/dataset/list' },
  database: { label: 'Database', listPath: '/database/list' },
  saved_query: { label: 'Saved Query', listPath: '/saved_query/list' },
  alert: { label: 'Alert', listPath: '/alert/list' },
  query_history: { label: 'History', listPath: '/query_history' },
  explore: { label: 'Explore', listPath: '/explore' },
  sqllab: { label: 'SQL Lab', listPath: '/sqllab' },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);
  const [crumbAnchorEl, setCrumbAnchorEl] = useState<HTMLElement | null>(null);
  const [crumbOptions, setCrumbOptions] = useState<{ label: string; path: string }[]>([]);
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const items = useMenuSettings(s => s.items);
  const enabled = useMenuSettings(s => s.enabled);

  useEffect(() => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return;
    const parentKey = parts[parts.length - 2];
    const lastPart = parts[parts.length - 1];
    if (!/^\d+$/.test(lastPart) || !knownSections[parentKey]) return;
    const id = lastPart;
    api.get(`/${parentKey}/${id}`)
      .then(res => {
        const data = res.data?.result as Record<string, unknown> | undefined;
        if (!data) return;
        const nameField = parentKey === 'dashboard' ? 'dashboard_title'
          : parentKey === 'chart' ? 'slice_name'
          : parentKey === 'dataset' ? 'table_name'
          : parentKey === 'saved_query' ? 'label'
          : parentKey === 'explore' ? 'slice_name'
          : null;
        if (nameField) {
          const name = data[nameField];
          if (name) setItemLabels(prev => ({ ...prev, [id]: String(name) }));
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const navItems = useMemo(() =>
    items.filter(item => item.id !== 'home' && enabled[item.id]),
  [items, enabled]);

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  const breadcrumbItems = useMemo((): CrumbItem[] => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return [];
    const crumbs: CrumbItem[] = [];
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc += `/${part}`;
      const isNumeric = /^\d+$/.test(part);
      if (isNumeric && i > 0 && knownSections[parts[i - 1]]) {
        const resolved = itemLabels[part];
        crumbs.push({ label: resolved || `#${part}`, path: acc, isId: true });
      } else if (knownSections[part]) {
        crumbs.push({ label: knownSections[part].label, path: acc, isId: false });
      } else {
        const label = part.charAt(0).toUpperCase() + part.slice(1).replace(/[_-]/g, ' ');
        crumbs.push({ label, path: acc, isId: false });
      }
    }
    return crumbs;
  }, [location.pathname, itemLabels]);

  const handleCrumbClick = useCallback(async (crumb: CrumbItem, e: React.MouseEvent<HTMLElement>) => {
    if (crumb.isId) {
      const target = e.currentTarget;
      const parentKey = location.pathname.split('/').filter(Boolean).slice(-2, -1)[0];
      const section = parentKey && knownSections[parentKey];
      if (section) {
        try {
          const res = await api.get(`/${parentKey}/?q=(page_size:200,page:0)`);
          const itemsList = (res.data?.result ?? []) as Record<string, unknown>[];
          const nameField = section.listPath.includes('dashboard') ? 'dashboard_title'
            : section.listPath.includes('chart') ? 'slice_name'
            : section.listPath.includes('dataset') ? 'table_name'
            : section.listPath.includes('saved_query') ? 'label'
            : null;
          setCrumbOptions(itemsList.map((item: Record<string, unknown>) => ({
            label: String(nameField && item[nameField] ? item[nameField] : item.id ?? ''),
            path: `/${parentKey}/${item.id}`,
          })));
        } catch {
          setCrumbOptions([]);
        }
      }
      setCrumbAnchorEl(target);
    }
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'grey.100' }}>
      <AppBar position="static" color="inherit" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
        <Toolbar variant="dense" sx={{ gap: 0.25, px: 1, minHeight: 48 }}>
          <Typography
            variant="h6"
            onClick={() => navigate('/')}
            sx={{ fontWeight: 700, cursor: 'pointer', mr: 1, fontSize: '1rem', letterSpacing: '-0.01em', flexShrink: 0 }}
          >
            starfly
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, overflow: 'hidden', flex: 1, minWidth: 0 }}>
            {navItems.map(item => (
              <Typography
                key={item.id}
                component={RouterLink}
                to={item.path}
                sx={{
                  fontSize: '0.8125rem',
                  fontWeight: isActive(item.path) ? 600 : 400,
                  color: isActive(item.path) ? 'primary.main' : 'text.secondary',
                  textDecoration: 'none',
                  px: 0.75,
                  py: 0.375,
                  borderRadius: 1,
                  whiteSpace: 'nowrap',
                  transition: 'color 150ms ease, background-color 150ms ease',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                }}
              >
                {item.label}
              </Typography>
            ))}

            <Typography
              onClick={e => setCreateAnchor(e.currentTarget)}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'primary.main',
                textDecoration: 'none',
                px: 1,
                py: 0.375,
                borderRadius: 1,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                flexShrink: 0,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <AddIcon sx={{ fontSize: 16 }} /> Create
            </Typography>

            <Menu
              anchorEl={createAnchor}
              open={Boolean(createAnchor)}
              onClose={() => setCreateAnchor(null)}
              onClick={() => setCreateAnchor(null)}
            >
              <MenuItem onClick={() => navigate('/explore')}>
                <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon> Chart
              </MenuItem>
              <MenuItem onClick={() => navigate('/dashboard/create')}>
                <ListItemIcon><DashboardIcon fontSize="small" /></ListItemIcon> Dashboard
              </MenuItem>
              <MenuItem onClick={() => navigate('/dataset/create')}>
                <ListItemIcon><TableChartOutlinedIcon fontSize="small" /></ListItemIcon> Dataset
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => navigate('/sqllab')}>
                <ListItemIcon><CodeIcon fontSize="small" /></ListItemIcon> SQL Query
              </MenuItem>
            </Menu>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 0.5 }}>
            {breadcrumbItems.map((crumb, i) => (
              <Box key={crumb.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {i > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>/</Typography>
                )}
                {crumb.isId ? (
                  <>
                    <Button
                      size="small"
                      onClick={e => handleCrumbClick(crumb, e)}
                      endIcon={<ArrowDropDownIcon />}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        px: 0.5,
                        minWidth: 0,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      {crumb.label}
                    </Button>
                  </>
                ) : (
                  <Typography
                    component={RouterLink}
                    to={crumb.path}
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: i === breadcrumbItems.length - 1 ? 600 : 400,
                      color: i === breadcrumbItems.length - 1 ? 'text.primary' : 'text.secondary',
                      textDecoration: 'none',
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    {crumb.label}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>

          <Menu
            anchorEl={crumbAnchorEl}
            open={Boolean(crumbAnchorEl)}
            onClose={() => setCrumbAnchorEl(null)}
            onClick={() => setCrumbAnchorEl(null)}
            slotProps={{ paper: { sx: { maxHeight: 300 } } }}
          >
            {crumbOptions.map(opt => (
              <MenuItem key={opt.path} onClick={() => navigate(opt.path)} selected={location.pathname === opt.path}>
                {opt.label}
              </MenuItem>
            ))}
          </Menu>

          <Tooltip title="Account">
            <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)} sx={{ ml: 0.5, p: 0 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
              mt: 1.5,
              '&::before': {
                content: '""', display: 'block', position: 'absolute', top: 0, right: 14,
                width: 10, height: 10, bgcolor: 'background.paper',
                transform: 'translateY(-50%) rotate(45deg)', zIndex: 0,
              },
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem>
          <Avatar sx={{ width: 28, height: 28, mr: 1 }} /> {user?.username || 'User'}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => navigate('/settings')}>
          <ListItemIcon><Settings fontSize="small" /></ListItemIcon> Settings
        </MenuItem>
        <MenuItem onClick={logout}>
          <ListItemIcon><Logout fontSize="small" /></ListItemIcon> Sign Out
        </MenuItem>
      </Menu>

      <Box component="main" sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
