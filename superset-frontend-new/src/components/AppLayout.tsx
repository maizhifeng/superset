import { type ReactNode, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Grow from '@mui/material/Grow';
import Logout from '@mui/icons-material/Logout';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SearchIcon from '@mui/icons-material/Search';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { keyframes } from '@emotion/react';
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
  const [crumbAnchorEl, setCrumbAnchorEl] = useState<HTMLElement | null>(null);
  const [crumbOptions, setCrumbOptions] = useState<{ label: string; path: string }[]>([]);
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const { custom: breadcrumbCustom } = useBreadcrumb();
  const toolbarTools = useToolbar();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => setSidebarOpen(document.body.classList.contains('sidebar-open')));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setSidebarOpen(document.body.classList.contains('sidebar-open'));
    return () => observer.disconnect();
  }, []);
  const items = useMenuSettings(s => s.items);
  const enabled = useMenuSettings(s => s.enabled);
  const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(null);
  const [navMoreAnchor, setNavMoreAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [hiddenNavCount, setHiddenNavCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

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

  useEffect(() => {
    const el = navRef.current;
    if (!el || navItems.length === 0 || el.clientWidth === 0) { setHiddenNavCount(0); return; }
    const check = () => {
      if (el.clientWidth === 0) { setHiddenNavCount(0); return; }
      const children = Array.from(el.children) as HTMLElement[];
      let w = 0;
      let visible = 0;
      for (let i = 0; i < children.length; i++) {
        w += children[i].offsetWidth;
        if (w > el.clientWidth) break;
        visible++;
      }
      setHiddenNavCount(Math.max(0, navItems.length - visible));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [navItems]);

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
      <AppBar position="static" color="inherit" sx={{ zIndex: theme => theme.zIndex.drawer + 1, visibility: sidebarOpen ? 'hidden' : 'visible', pointerEvents: sidebarOpen ? 'none' : 'auto' }}>
        <Toolbar variant="dense" sx={{ gap: 0, px: 0.5, minHeight: 44 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}>
            <IconButton size="small" onClick={() => setDrawerOpen(true)} sx={{ display: { xs: 'inline-flex', sm: 'none' }, mr: 0.25 }}>
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <Typography
              variant="h6"
              onClick={() => navigate('/')}
              sx={{ fontWeight: 700, cursor: 'pointer', mr: 0.5, fontSize: '1rem', letterSpacing: '-0.01em', flexShrink: 0 }}
            >
              starfly
            </Typography>

            <Box ref={navRef} sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0, overflow: 'hidden', minWidth: 0 }}>
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
                    flexShrink: 0,
                    transition: 'color 150ms ease, background-color 150ms ease',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  {item.label}
                </Typography>
              ))}
            </Box>
            {hiddenNavCount > 0 && (
              <IconButton
                size="small"
                onClick={e => setNavMoreAnchor(e.currentTarget)}
                sx={{ display: { xs: 'none', sm: 'inline-flex' }, ml: 0.25 }}
              >
                <MoreHorizIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            <Menu
              anchorEl={navMoreAnchor}
              open={Boolean(navMoreAnchor)}
              onClose={() => setNavMoreAnchor(null)}
              onClick={() => setNavMoreAnchor(null)}
              transformOrigin={{ horizontal: 'left', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
              slotProps={{ paper: { sx: { minWidth: 160 } } }}
            >
              {hiddenNavCount > 0 && navItems.slice(-hiddenNavCount).map(item => (
                <MenuItem
                  key={item.id}
                  component={RouterLink}
                  to={item.path}
                  selected={isActive(item.path)}
                  dense
                  sx={{ fontSize: '0.8125rem', minHeight: 36 }}
                >
                  {item.label}
                </MenuItem>
              ))}
            </Menu>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: '1 1 0', justifyContent: 'flex-end' }}>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center', overflow: 'hidden', minWidth: 0, maxWidth: 300 }}>
            {toolbarTools.filter(t => t.id === 'search').map(tool => (
              <Box key={tool.id} sx={{ width: '100%' }}>{tool.render}</Box>
            ))}
          </Box>
          <IconButton
            size="small"
            onClick={() => setSearchOpen(true)}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            <SearchIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Dialog
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            fullWidth
            maxWidth="sm"
            slotProps={{ paper: { sx: { position: 'fixed', top: 60, m: 0, borderRadius: 2 } } }}
          >
            <DialogContent sx={{ p: 2 }} onClick={() => setSearchOpen(false)}>
              {toolbarTools.filter(t => t.id === 'search').map(tool => (
                <Box key={tool.id} onClick={e => e.stopPropagation()}>{tool.render}</Box>
              ))}
            </DialogContent>
          </Dialog>
          <Breadcrumbs
            separator={<NavigateNextIcon sx={{ fontSize: 11, color: 'text.disabled' }} />}
            maxItems={4}
            itemsAfterCollapse={2}
            itemsBeforeCollapse={1}
            sx={{ fontStyle: 'italic', pr: { xs: 1.5, sm: 0 }, '& .MuiBreadcrumbs-ol': { gap: 0, flexWrap: 'nowrap' } }}
          >
            {breadcrumbItems.map((crumb, i) => (
              crumb.isId ? (
                <Button
                  key={crumb.path}
                  size="small"
                  onClick={e => handleCrumbClick(crumb, e)}
                  endIcon={<ArrowDropDownIcon sx={{ fontSize: 15 }} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: i === breadcrumbItems.length - 1 ? 600 : 400,
                    fontSize: '0.9375rem',
                    fontStyle: 'italic',
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                    color: i === breadcrumbItems.length - 1 ? 'text.secondary' : 'text.disabled',
                    px: 0.25,
                    flexShrink: 0,
                    letterSpacing: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {breadcrumbCustom?.status && i === breadcrumbItems.length - 1 && (
                    <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: breadcrumbCustom.status === 'published' ? 'success.main' : 'warning.main', mr: 0.375, flexShrink: 0 }} />
                  )}
                  {breadcrumbCustom?.label || crumb.label}
                </Button>
              ) : (
                <Typography
                  key={crumb.path}
                  component={RouterLink}
                  to={crumb.path}
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: i === breadcrumbItems.length - 1 ? 600 : 400,
                    fontStyle: 'italic',
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                    color: i === breadcrumbItems.length - 1 ? 'text.secondary' : 'text.disabled',
                    px: 0.25,
                    flexShrink: 0,
                    letterSpacing: 0,
                    lineHeight: 1.2,
                  }}
                  onClick={() => setDrawerOpen(false)}
                >
                  {crumb.label}
                </Typography>
              )
            ))}
          </Breadcrumbs>
          {toolbarTools.filter(t => t.id !== 'search' && !t.primary).length > 0 && (
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5, px: 0.5, overflow: 'hidden', minWidth: 0 }}>
            {toolbarTools.filter(t => t.id !== 'search' && !t.primary).slice(0, 3).map((tool, i) => (
              <Box key={tool.id} sx={{ display: 'block', animation: `${toolFadeIn} 250ms cubic-bezier(0.4, 0, 0.2, 1) both`, animationDelay: `${i * 50}ms` }}>
                {tool.render}
              </Box>
            ))}
            {toolbarTools.filter(t => t.id !== 'search' && !t.primary).length > 3 && (
              <IconButton size="small" onClick={e => setOverflowAnchor(e.currentTarget)}
                sx={{ transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)', transform: Boolean(overflowAnchor) ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <MoreHorizIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            <Menu anchorEl={overflowAnchor} open={Boolean(overflowAnchor)} onClose={() => setOverflowAnchor(null)} onClick={() => setOverflowAnchor(null)}
              slots={{ transition: Grow }} slotProps={{ transition: { timeout: 250 }, paper: { sx: { minWidth: 160, overflow: 'visible', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.16))', mt: 0.75, '&::before': { content: '""', display: 'block', position: 'absolute', top: 0, right: 18, width: 10, height: 10, bgcolor: 'background.paper', transform: 'translateY(-50%) rotate(45deg)', zIndex: 0 } } } }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
              {toolbarTools.filter(t => t.id !== 'search' && !t.primary).slice(3).map(tool => (
                <MenuItem key={tool.id} dense sx={{ fontSize: '0.8125rem', minHeight: 36 }}>{tool.render}</MenuItem>
              ))}
            </Menu>
          </Box>
          )}
          <IconButton
            size="small"
            onClick={e => setOverflowAnchor(e.currentTarget)}
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, ml: 0.5 }}
          >
            <Avatar sx={{ width: 26, height: 26, fontSize: '0.7rem', bgcolor: 'primary.main' }}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            onClick={() => setOverflowAnchor(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            slotProps={{ paper: { sx: { minWidth: 140 } } }}
          >
            <MenuItem dense disabled sx={{ fontSize: '0.8125rem', opacity: '1 !important' }}>
              {user?.username || 'User'}
            </MenuItem>
            <Divider />
            <MenuItem dense onClick={logout} sx={{ fontSize: '0.8125rem' }}>
              <Logout sx={{ fontSize: 16, mr: 1 }} /> Logout
            </MenuItem>
          </Menu>
          <Menu anchorEl={crumbAnchorEl} open={Boolean(crumbAnchorEl)} onClose={() => setCrumbAnchorEl(null)} onClick={() => setCrumbAnchorEl(null)}
            slotProps={{ paper: { sx: { maxHeight: 300 } } }}>
            {crumbOptions.map(opt => (
              <MenuItem key={opt.path} onClick={() => navigate(opt.path)} selected={location.pathname === opt.path}>{opt.label}</MenuItem>
            ))}
          </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </Box>
      <GlobalSnackbar />
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { xs: 'block', sm: 'none' } }}
        slotProps={{ paper: { sx: { width: { xs: '80vw', sm: 260 } } } }}
      >
        <Box sx={{ width: { xs: '30vw', sm: 260 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>starfly</Typography>
          </Box>
          <List sx={{ flex: 1, overflow: 'auto' }}>
            {items.filter(item => item.id !== 'home' && enabled[item.id]).map(item => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  selected={isActive(item.path)}
                  onClick={() => setDrawerOpen(false)}
                  sx={{ '&.Mui-selected': { bgcolor: 'action.selected' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: '0.875rem', fontWeight: isActive(item.path) ? 600 : 400 } } }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Divider />
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>{user?.username || 'User'}</Typography>
            </Box>
            <IconButton size="small" onClick={logout}><Logout sx={{ fontSize: 18 }} /></IconButton>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
