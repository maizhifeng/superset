import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import Divider from '@mui/material/Divider';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Link from '@mui/material/Link';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CloseIcon from '@mui/icons-material/Close';
import PersonAdd from '@mui/icons-material/PersonAdd';
import Settings from '@mui/icons-material/Settings';
import Logout from '@mui/icons-material/Logout';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import GlobalFilters from './GlobalFilters';
import HistoryDrawer from './HistoryDrawer';
import ThemeColorPicker from './ThemeColorPicker';
import { useOperationLogStore, useDashboardStore } from '../store';
import { Icon } from '@/components/ui/icon';
import { useMediaQuery, useTheme } from '@mui/material';

const navItems = [
  { path: '/dashboards', label: '仪表盘', icon: 'dashboard' },
  { path: '/metrics', label: '指标', icon: 'chart' },
  { path: '/datasets', label: '数据集', icon: 'database' },
  { path: '/cohort', label: '同期群', icon: 'cohort' },
  { path: '/db-config', label: '数据源', icon: 'plug' },
  { path: '/system', label: '系统', icon: 'server' },
];

const DRAWER_WIDTH_EXPANDED = 160;
const DRAWER_WIDTH_COLLAPSED = 44;
const APPBAR_HEIGHT = 56;
const APPBAR_COMPACT_HEIGHT = 32;

export default function Layout({ children }) {
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState(null);
  const accountMenuOpen = Boolean(accountMenuAnchor);
  const handleAccountMenuClick = (event) => {
    setAccountMenuAnchor(event.currentTarget);
  };
  const handleAccountMenuClose = () => {
    setAccountMenuAnchor(null);
  };
  const items = useOperationLogStore((state) => state.items);
  const resetGlobalFilters = useDashboardStore((state) => state.resetGlobalFilters);
  const dashboardId = location.pathname.startsWith('/dashboards/')
    ? location.pathname.split('/')[2]
    : null;
  const dashboards = useDashboardStore((state) => state.dashboards);
  const selectedDashboard = useDashboardStore((state) => state.selectedDashboard);

  const notificationCount = items.filter(i => i.status === 'draft').length;

  // Sync sidebar state when crossing the responsive breakpoint
  useEffect(() => {
    if (isDesktop) {
      setDesktopExpanded(true);
    } else {
      setMobileOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (dashboardId) {
      resetGlobalFilters();
    }
  }, [dashboardId, resetGlobalFilters]);

  const sidebarWidth = desktopExpanded ? DRAWER_WIDTH_EXPANDED : DRAWER_WIDTH_COLLAPSED;

  // Breadcrumb items based on current route
  const getBreadcrumbs = () => {
    const crumbs = [{ label: '仪表盘', path: '/dashboards' }];
    const path = location.pathname;

    if (path === '/dashboards') return crumbs;
    if (path.startsWith('/dashboards/')) {
      const id = path.split('/')[2];
      const dashboard = selectedDashboard || dashboards.find(d => String(d.id) === id);
      return [...crumbs, { label: dashboard?.name || id, path: path }];
    }
    if (path === '/metrics') return [{ label: '指标', path: '/metrics' }];
    if (path.startsWith('/metrics/builder')) return [{ label: '指标', path: '/metrics' }, { label: '新建', path: '/metrics/builder' }];
    if (path === '/datasets') return [{ label: '数据集', path: '/datasets' }];
    if (path === '/cohort') return [{ label: '同期群分析', path: '/cohort' }];
    if (path === '/system') return [{ label: '系统状态', path: '/system' }];

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // Sidebar content component
  const SidebarContent = ({ onClose }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {onClose && (
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, height: APPBAR_HEIGHT }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>菜单</Typography>
          <Tooltip title="关闭菜单">
            <IconButton onClick={onClose} aria-label="关闭菜单" size="small">
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <List sx={{ px: 1, py: 1, flex: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={RouterLink}
                to={item.path}
                onClick={() => onClose?.()}
                  sx={{
                    borderRadius: 2,
                    bgcolor: isActive ? 'action.selected' : 'transparent',
                    color: isActive ? 'primary.main' : 'text.primary',
                    '&:hover': {
                      bgcolor: isActive ? 'action.selected' : 'action.hover',
                    },
                    px: 1,
                    justifyContent: 'flex-start',
                    minHeight: 40,
                    // 左侧选中指示条
                    ...(isActive && {
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 3,
                        height: 20,
                        borderRadius: '2px 0 0 2px',
                        bgcolor: 'primary.main',
                      },
                    }),
                  }}
              >
                {/* Icon - fixed position, never moves */}
                <ListItemIcon sx={{ minWidth: 36, mr: 2, justifyContent: 'flex-start' }}>
                  <Icon name={item.icon} size={20} sx={{ color: isActive ? 'primary.main' : 'text.secondary' }} />
                </ListItemIcon>
                {/* Text - width animates, hidden when collapsed */}
                <ListItemText>
                  <Typography
                    fontSize="0.875rem"
                    fontWeight={isActive ? 600 : 400}
                    color={isActive ? 'primary.main' : 'text.primary'}
                    sx={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      maxWidth: desktopExpanded ? 120 : 0,
                      transition: 'max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: desktopExpanded ? 1 : 0,
                    }}
                  >
                    {item.label}
                  </Typography>
                </ListItemText>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      <Box sx={{ p: 1 }}>
        <ListItemButton
          onClick={() => setShowHistory(true)}
          sx={{
            borderRadius: 2,
            px: 1,
            justifyContent: 'flex-start',
            minHeight: 40,
          }}
        >
          {/* Icon with badge - always visible */}
          <ListItemIcon sx={{ minWidth: 36, mr: 2, justifyContent: 'flex-start', position: 'relative' }}>
            {items.length > 0 ? (
              <Badge badgeContent={items.length} color="primary" anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
                sx={{ '& .MuiBadge-badge': { left: 0, right: 'auto', minWidth: 14, height: 14, fontSize: '0.625rem' } }}
              >
                <Icon name="history" size={20} />
              </Badge>
            ) : (
              <Icon name="history" size={20} />
            )}
          </ListItemIcon>
          {/* Text - width animates */}
          <ListItemText>
            <Typography
              fontSize="0.875rem"
              fontWeight={500}
              sx={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: desktopExpanded ? 120 : 0,
                transition: 'max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: desktopExpanded ? 1 : 0,
              }}
            >
              操作记录
            </Typography>
          </ListItemText>
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Top AppBar */}
      <AppBar
        position="static"
        color="inherit"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          '& .appbar-toolbar': {
            minHeight: APPBAR_COMPACT_HEIGHT,
          },
          '& .appbar-icon, & .appbar-avatar': {
            opacity: 0.85,
          },
        }}
      >
        <Toolbar
          disableGutters
          className="appbar-toolbar"
          sx={{
            minHeight: APPBAR_COMPACT_HEIGHT,
            px: 1,
            gap: 1,
          }}
        >
          {/* Desktop sidebar toggle button */}
          <Tooltip title="切换侧边栏">
            <IconButton
              color="inherit"
              onClick={() => setDesktopExpanded(!desktopExpanded)}
              className="appbar-icon"
              sx={{
                display: { xs: 'none', lg: 'flex' },
                minWidth: 36,
                p: 0.5,
                mr: 1,
              }}
              aria-label="切换侧边栏"
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Mobile menu button - toggles drawer open/close */}
          <Tooltip title={mobileOpen ? '关闭菜单' : '打开菜单'}>
            <IconButton
              color="inherit"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="appbar-icon"
              sx={{
                display: { xs: 'flex', lg: 'none' },
                minWidth: 36,
                p: 0.5,
                mr: 1,
              }}
              aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
            >
              {mobileOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Breadcrumb navigation */}
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" />}
            className="appbar-text"
            sx={{
              flexGrow: 1,
            }}
          >
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return isLast ? (
                <Typography
                  key={crumb.path}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'text.primary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {crumb.label}
                </Typography>
              ) : (
                <Link
                  key={crumb.path}
                  component={RouterLink}
                  to={crumb.path}
                  underline="hover"
                  color="inherit"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  {crumb.label}
                </Link>
              );
            })}
          </Breadcrumbs>

          {/* Notification bell */}
          <Tooltip title="通知">
            <IconButton
              color="inherit"
              size="small"
              className="appbar-icon"
              aria-label="通知"
            >
              <Badge badgeContent={notificationCount} color="error">
                <NotificationsIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Theme color picker */}
          <ThemeColorPicker />

          {/* Account menu */}
          <Tooltip title="账户设置">
            <IconButton
              className="appbar-avatar"
              onClick={handleAccountMenuClick}
              size="small"
              sx={{ p: 0 }}
              aria-controls={accountMenuOpen ? 'account-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={accountMenuOpen ? 'true' : undefined}
            >
              <Avatar sx={{ width: 32, height: 32 }}>U</Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Account menu dropdown */}
      <Menu
        anchorEl={accountMenuAnchor}
        id="account-menu"
        open={accountMenuOpen}
        onClose={handleAccountMenuClose}
        onClick={handleAccountMenuClose}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
              mt: 1.5,
              '& .MuiAvatar-root': {
                width: 32,
                height: 32,
                ml: -0.5,
                mr: 1,
              },
              '&::before': {
                content: '""',
                display: 'block',
                position: 'absolute',
                top: 0,
                right: 14,
                width: 10,
                height: 10,
                bgcolor: 'background.paper',
                transform: 'translateY(-50%) rotate(45deg)',
                zIndex: 0,
              },
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleAccountMenuClose}>
          <Avatar /> Profile
        </MenuItem>
        <MenuItem onClick={handleAccountMenuClose}>
          <Avatar /> My account
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleAccountMenuClose}>
          <ListItemIcon>
            <PersonAdd fontSize="small" />
          </ListItemIcon>
          Add another account
        </MenuItem>
        <MenuItem onClick={handleAccountMenuClose}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleAccountMenuClose}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Content area: sidebar + main, below AppBar */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'visible', minHeight: 0 }}>
        {/* Mobile Drawer - temporary overlay */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => { document.activeElement?.blur(); setMobileOpen(false); }}
          slotProps={{
            modal: { keepMounted: true },
            paper: {
              sx: {
                width: DRAWER_WIDTH_EXPANDED,
              },
            },
          }}
          sx={{
            display: { xs: 'block', lg: 'none' },
          }}
        >
          <SidebarContent onClose={() => setMobileOpen(false)} />
        </Drawer>

        {/* Desktop Sidebar - custom Box with width transition */}
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', lg: 'flex' },
            width: sidebarWidth,
            bgcolor: 'var(--mui-palette-bg-sidebar)',
            borderRight: '1px solid',
            borderColor: 'divider',
            flexDirection: 'column',
            flexShrink: 0,
            transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          <SidebarContent />
        </Box>

        {/* Main content area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {dashboardId && <GlobalFilters />}
          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>{children}</Box>
        </Box>
      </Box>

      <HistoryDrawer isOpen={showHistory} dashboardId={dashboardId} onClose={() => setShowHistory(false)} />
    </Box>
  );
}