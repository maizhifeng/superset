import { type ReactNode, useState } from 'react';
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
import Breadcrumbs from '@mui/material/Breadcrumbs';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Link from '@mui/material/Link';
import Logout from '@mui/icons-material/Logout';
import Settings from '@mui/icons-material/Settings';
import { useAuth } from '@/contexts/AuthContext';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';

const navItems = [
  { path: '/', label: 'Home', icon: 'dashboard' },
  { path: '/dashboard/list', label: 'Dashboards', icon: 'dashboard' },
  { path: '/chart/list', label: 'Charts', icon: 'chart' },
  { path: '/sqllab', label: 'SQL Lab', icon: 'code' },
  { path: '/dataset/list', label: 'Datasets', icon: 'database' },
  { path: '/database/list', label: 'Databases', icon: 'database' },
  { path: '/saved_query/list', label: 'Saved Queries', icon: 'save' },
  { path: '/alert/list', label: 'Alerts', icon: 'warning' },
  { path: '/query_history', label: 'History', icon: 'history' },
];

function getBreadcrumbs(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    const label = part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, ' ');
    crumbs.push({ label, path: acc });
  }
  if (crumbs.length === 0) crumbs.push({ label: 'Home', path: '/' });
  return crumbs;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { custom } = useBreadcrumb();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const breadcrumbs = getBreadcrumbs(location.pathname);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'grey.100' }}>
      <AppBar position="static" color="inherit" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
        <Toolbar variant="dense" sx={{ gap: 0.5, px: 1, minHeight: 48 }}>
          <Typography
            variant="h6"
            onClick={() => navigate('/')}
            sx={{ fontWeight: 700, cursor: 'pointer', mr: 1.5, fontSize: '1rem', letterSpacing: '-0.01em' }}
          >
            Superset
          </Typography>

          {navItems.map(item => (
            <Typography
              key={item.path}
              component={RouterLink}
              to={item.path}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: location.pathname.startsWith(item.path) ? 600 : 400,
                color: location.pathname.startsWith(item.path) ? 'primary.main' : 'text.secondary',
                textDecoration: 'none',
                px: 1,
                py: 0.5,
                borderRadius: 1,
                transition: 'color 150ms ease, background-color 150ms ease',
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
              }}
            >
              {item.label}
            </Typography>
          ))}

          <Box sx={{ flexGrow: 1 }} />

          {custom ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Breadcrumbs
                separator={<NavigateNextIcon sx={{ fontSize: 12 }} />}
              >
                {breadcrumbs.slice(0, -1).map(crumb => (
                  <Link key={crumb.path} component={RouterLink} to={crumb.path} underline="hover" color="inherit" sx={{ fontSize: '0.75rem' }}>
                    {crumb.label}
                  </Link>
                ))}
              </Breadcrumbs>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', color: 'text.primary', ml: 0.5 }}>
                {custom.label}
              </Typography>
              {custom.actions}
            </Box>
          ) : (
            <Breadcrumbs
              separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
              sx={{ '& .MuiBreadcrumbs-ol': { justifyContent: 'flex-end' } }}
            >
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return isLast ? (
                  <Typography key={crumb.path} sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' }}>
                    {crumb.label}
                  </Typography>
                ) : (
                  <Link key={crumb.path} component={RouterLink} to={crumb.path} underline="hover" color="inherit" sx={{ fontSize: '0.75rem' }}>
                    {crumb.label}
                  </Link>
                );
              })}
            </Breadcrumbs>
          )}

          <Tooltip title="Account">
            <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)} sx={{ ml: 1, p: 0 }}>
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
        <MenuItem>
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
