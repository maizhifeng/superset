import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Logout from '@mui/icons-material/Logout';

interface UserMenuProps {
  username?: string;
  anchorEl: HTMLElement | null;
  onOpen: (e: React.MouseEvent<HTMLElement>) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function UserMenu({ username, anchorEl, onOpen, onClose, onLogout }: UserMenuProps) {
  return (
    <>
      <IconButton
        size="small"
        onClick={onOpen}
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, ml: 0.5 }}
      >
        <Avatar sx={{ width: 26, height: 26, fontSize: '0.7rem', bgcolor: 'primary.main' }}>
          {username?.charAt(0).toUpperCase() || 'U'}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={onClose}
        onClick={onClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { minWidth: 140 } } }}
      >
        <MenuItem dense disabled sx={{ fontSize: '0.8125rem', opacity: '1 !important' }}>
          {username || 'User'}
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={onLogout} sx={{ fontSize: '0.8125rem' }}>
          <Logout sx={{ fontSize: 16, mr: 1 }} /> Logout
        </MenuItem>
      </Menu>
    </>
  );
}
