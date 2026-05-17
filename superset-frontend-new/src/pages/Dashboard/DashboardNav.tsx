import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';

interface DashboardNavProps {
  open: boolean;
  items: { id: number; name: string }[];
  onClose: () => void;
}

export default function DashboardNav({ open, items, onClose }: DashboardNavProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { maxHeight: 500, borderRadius: 2 } } }}
    >
      <DialogContent sx={{ p: 0 }}>
        <List>
          {items.map(item => (
            <ListItem key={item.id} disablePadding>
              <ListItemButton onClick={() => { onClose(); const el = document.querySelector(`[data-chart-index="${item.id}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} sx={{ py: 2.5, px: 2 }}>
                <ListItemText primary={item.name} slotProps={{ primary: { sx: { fontSize: '0.9375rem' } } }} />
              </ListItemButton>
            </ListItem>
          ))}
          {items.length === 0 && (
            <ListItem dense sx={{ justifyContent: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem', py: 1 }}>
                No charts found
              </Typography>
            </ListItem>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
