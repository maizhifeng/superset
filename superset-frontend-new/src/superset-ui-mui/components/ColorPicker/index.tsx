import { forwardRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

export interface ColorPickerProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  '#FF6B6B',
  '#FFA94D',
  '#FFD43B',
  '#69DB7C',
  '#38D9A9',
  '#4DABF7',
  '#748FFC',
  '#DA77F2',
  '#F783AC',
  '#868E96',
  '#495057',
  '#212529',
];

const SupersetColorPicker = forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ value = '#000000', onChange, label }, ref) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    }, []);

    const handleClose = useCallback(() => {
      setAnchorEl(null);
    }, []);

    const handleSelect = useCallback(
      (color: string) => {
        onChange?.(color);
        handleClose();
      },
      [onChange, handleClose],
    );

    return (
      <Box ref={ref}>
        <TextField
          label={label}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          onClick={handleClick}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '4px',
                      backgroundColor: value,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                    }}
                  />
                </InputAdornment>
              ),
            },
          }}
          fullWidth
        />
        <Popover
          open={!!anchorEl}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1.5, width: 180 }}>
            {PRESET_COLORS.map(color => (
              <Box
                key={color}
                onClick={() => handleSelect(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '6px',
                  backgroundColor: color,
                  cursor: 'pointer',
                  border: value === color ? '2px solid' : '1px solid',
                  borderColor: value === color ? 'primary.main' : 'divider',
                  '&:hover': { transform: 'scale(1.15)', transition: '0.15s' },
                }}
              />
            ))}
          </Box>
        </Popover>
      </Box>
    );
  },
);

SupersetColorPicker.displayName = 'SupersetColorPicker';

export default SupersetColorPicker;
