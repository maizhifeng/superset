import { forwardRef, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';

export interface CronPickerProps {
  value?: string;
  onChange?: (value: string) => void;
}

interface CronParts {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
}

const DEFAULT_CRON = '* * * * *';

function parseCron(cron: string): CronParts {
  const parts = cron.trim().split(/\s+/);
  return {
    minute: parts[0] ?? '*',
    hour: parts[1] ?? '*',
    day: parts[2] ?? '*',
    month: parts[3] ?? '*',
    weekday: parts[4] ?? '*',
  };
}

function joinCron(parts: CronParts): string {
  return `${parts.minute} ${parts.hour} ${parts.day} ${parts.month} ${parts.weekday}`;
}

const PRESETS: { label: string; cron: string }[] = [
  { label: 'Every minute', cron: '* * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every day at midnight', cron: '0 0 * * *' },
  { label: 'Every Monday', cron: '0 0 * * 1' },
  { label: 'First day of month', cron: '0 0 1 * *' },
];

const SupersetCronPicker = forwardRef<HTMLDivElement, CronPickerProps>(
  ({ value = DEFAULT_CRON, onChange }, ref) => {
    const [parts, setParts] = useState<CronParts>(() => parseCron(value));

    useEffect(() => {
      setParts(parseCron(value));
    }, [value]);

    const updatePart = (key: keyof CronParts, val: string) => {
      const next = { ...parts, [key]: val };
      setParts(next);
      onChange?.(joinCron(next));
    };

    const handlePreset = (cron: string) => {
      const parsed = parseCron(cron);
      setParts(parsed);
      onChange?.(cron);
    };

    return (
      <Box ref={ref} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Preset</InputLabel>
          <Select
            value=""
            label="Preset"
            onChange={e => handlePreset(e.target.value as string)}
          >
            {PRESETS.map(p => (
              <MenuItem key={p.cron} value={p.cron}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            label="Minute"
            value={parts.minute}
            onChange={e => updatePart('minute', e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            size="small"
            label="Hour"
            value={parts.hour}
            onChange={e => updatePart('hour', e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            size="small"
            label="Day"
            value={parts.day}
            onChange={e => updatePart('day', e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            size="small"
            label="Month"
            value={parts.month}
            onChange={e => updatePart('month', e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            size="small"
            label="Weekday"
            value={parts.weekday}
            onChange={e => updatePart('weekday', e.target.value)}
            sx={{ width: 90 }}
          />
        </Box>
      </Box>
    );
  },
);

SupersetCronPicker.displayName = 'SupersetCronPicker';

export default SupersetCronPicker;
