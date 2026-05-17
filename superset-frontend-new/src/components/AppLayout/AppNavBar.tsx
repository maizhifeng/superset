import { type RefObject } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

interface NavItem {
  id: string;
  label: string;
  path: string;
}

interface AppNavBarProps {
  navItems: NavItem[];
  isActive: (path: string) => boolean;
  hiddenNavCount: number;
  navMoreAnchor: HTMLElement | null;
  navRef: RefObject<HTMLDivElement | null>;
  onNavMoreOpen: (e: React.MouseEvent<HTMLElement>) => void;
  onNavMoreClose: () => void;
}

export default function AppNavBar({
  navItems, isActive, hiddenNavCount, navMoreAnchor, navRef,
  onNavMoreOpen, onNavMoreClose,
}: AppNavBarProps) {
  return (
    <>
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
          onClick={onNavMoreOpen}
          sx={{ display: { xs: 'none', sm: 'inline-flex' }, ml: 0.25 }}
        >
          <MoreHorizIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      <Menu
        anchorEl={navMoreAnchor}
        open={Boolean(navMoreAnchor)}
        onClose={onNavMoreClose}
        onClick={onNavMoreClose}
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
    </>
  );
}
