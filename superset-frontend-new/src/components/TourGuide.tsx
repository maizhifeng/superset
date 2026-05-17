import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import ExploreIcon from '@mui/icons-material/Explore';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { useDismissible } from '@/hooks/useDismissible';

const STEPS = [
  {
    icon: <ExploreIcon sx={{ fontSize: 40 }} />,
    title: 'Welcome to Starfly',
    description: 'Your data exploration platform. Browse dashboards, create charts, and run SQL queries — all in one place.',
  },
  {
    icon: <SearchIcon sx={{ fontSize: 40 }} />,
    title: 'Search Anything',
    description: 'Press / to open the search dialog. Type what you\'re looking for — dashboards, charts, datasets, or ask questions about your data.',
  },
  {
    icon: <KeyboardIcon sx={{ fontSize: 40 }} />,
    title: 'Keyboard Shortcuts',
    description: 'Press Shift+? to see all available shortcuts. Use G then D to go to Datasets, G then B for Dashboards — fast navigation without the mouse.',
  },
];

export default function TourGuide() {
  const [dismissed, dismiss] = useDismissible('tour_v1');
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  if (dismissed) return null;

  const current = STEPS[step];

  const handleClose = () => {
    dismiss();
  };

  const handleNext = () => {
    if (isLast) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <Dialog open={!dismissed} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
        <Box sx={{ color: 'primary.main', mb: 1 }}>{current.icon}</Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{current.title}</Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', px: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {current.description}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 2.5, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <Box
              key={i}
              sx={{
                width: i === step ? 20 : 8,
                height: 8,
                borderRadius: 4,
                bgcolor: i === step ? 'primary.main' : 'grey.300',
                transition: 'all 200ms',
              }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
        <Button size="small" onClick={handleClose} sx={{ color: 'text.secondary' }}>
          Skip
        </Button>
        <Button variant="contained" size="small" onClick={handleNext}>
          {isLast ? 'Done' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
