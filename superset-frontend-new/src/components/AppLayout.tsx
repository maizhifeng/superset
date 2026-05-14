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
import Grow from '@mui/material/Grow';
import { keyframes } from '@emotion/react';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Logout from '@mui/icons-material/Logout';
import Settings from '@mui/icons-material/Settings';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useAuth } from '@/contexts/AuthContext';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useToolbar } from '@/contexts/ToolbarContext';
import { useMenuSettings } from '@/store/menuSettings';
import GlobalSnackbar from '@/components/GlobalSnackbar';
import api from '@/api';

interface CrumbItem {
  label: string;
  path: string;
  isId: boolean;
  options?: { label: string; path: string }[];
}

const toolFadeIn = keyframes`
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
`;

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
  const [crumbAnchorEl, setCrumbAnchorEl] = useState<HTMLElement | null>(null);
  const [crumbOptions, setCrumbOptions] = useState<{ label: string; path: string }[]>([]);
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const { custom: breadcrumbCustom } = useBreadcrumb();
  const toolbarTools = useToolbar();
  const items = useMenuSettings(s => s.items);
  const enabled = useMenuSettings(s => s.enabled);
  const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(null);

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

          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 0.5 }}>
            {breadcrumbItems.map((crumb, i) => (
              <Box key={crumb.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {i > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>/</Typography>
                )}
                {crumb.isId ? (
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
                    {breadcrumbCustom?.label || crumb.label}
                  </Button>
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5 }}>
            {toolbarTools.slice(0, 3).map((tool, i) => (
              <Box
                key={tool.id}
                sx={{
                  display: { xs: tool.showOnMobile ? 'block' : 'none', sm: 'block' },
                  animation: `${toolFadeIn} 250ms cubic-bezier(0.4, 0, 0.2, 1) both`,
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {tool.render}
              </Box>
            ))}
            {toolbarTools.length > 3 && (
              <>
                <IconButton
                  size="small"
                  onClick={e => setOverflowAnchor(e.currentTarget)}
                  sx={{
                    transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: Boolean(overflowAnchor) ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  <MoreHorizIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <Menu
                  anchorEl={overflowAnchor}
                  open={Boolean(overflowAnchor)}
                  onClose={() => setOverflowAnchor(null)}
                  onClick={() => setOverflowAnchor(null)}
                  slots={{ transition: Grow }}
                  slotProps={{
                    transition: { timeout: 250 },
                    paper: {
                      sx: {
                        minWidth: 160,
                        overflow: 'visible',
                        filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.16))',
                        mt: 0.75,
                        '&::before': {
                          content: '""', display: 'block', position: 'absolute', top: 0, right: 18,
                          width: 10, height: 10, bgcolor: 'background.paper',
                          transform: 'translateY(-50%) rotate(45deg)', zIndex: 0,
                        },
                      },
                    },
                  }}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  {toolbarTools.slice(3).map(tool => (
                    <MenuItem key={tool.id} dense sx={{ fontSize: '0.8125rem', minHeight: 36 }}>
                      {tool.render}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Box>

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
      <GlobalSnackbar />
    </Box>
  );
}
