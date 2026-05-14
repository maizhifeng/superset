import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import DonutSmallIcon from '@mui/icons-material/DonutSmall';
import TableChartIcon from '@mui/icons-material/TableChart';
import PinIcon from '@mui/icons-material/Pin';

const CHART_TYPES = ['line', 'bar', 'area', 'pie', 'table', 'big_number', 'big_number_total'] as const;
export type ChartType = typeof CHART_TYPES[number];

interface ChartTypeMeta {
  value: ChartType;
  icon: React.ReactNode;
  label: string;
}

const chartTypeMeta: ChartTypeMeta[] = [
  { value: 'line', icon: <ShowChartIcon />, label: 'Line' },
  { value: 'bar', icon: <BarChartIcon />, label: 'Bar' },
  { value: 'area', icon: <ShowChartIcon sx={{ transform: 'scaleY(0.7)' }} />, label: 'Area' },
  { value: 'pie', icon: <DonutSmallIcon />, label: 'Pie' },
  { value: 'table', icon: <TableChartIcon />, label: 'Table' },
  { value: 'big_number', icon: <PinIcon />, label: 'Big Number' },
  { value: 'big_number_total', icon: <PinIcon sx={{ transform: 'rotate(45deg)' }} />, label: 'Big Number Total' },
];

interface ChartTypeSelectorProps {
  value: string;
  suggested?: string | null;
  onChange: (value: string) => void;
}

export default function ChartTypeSelector({ value, suggested, onChange }: ChartTypeSelectorProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, val) => val && onChange(val)}
      size="small"
      sx={{
        flexWrap: 'wrap',
        gap: 0.5,
        '& .MuiToggleButton-root': {
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          px: 1,
          py: 0.5,
          textTransform: 'none',
          fontSize: '0.75rem',
          minWidth: 56,
          display: 'flex',
          gap: 0.5,
          '&.Mui-selected': {
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          },
        },
      }}
    >
      {chartTypeMeta.map(meta => {
        const isSuggested = suggested === meta.value && meta.value !== value;
        return (
          <Tooltip key={meta.value} title={isSuggested ? `${meta.label} (suggested)` : meta.label}>
            <ToggleButton
              value={meta.value}
              sx={isSuggested ? {
                borderColor: 'primary.light',
                borderWidth: 2,
                '&:not(.Mui-selected)': { bgcolor: 'rgba(32, 167, 201, 0.04)' },
              } : undefined}
            >
              {meta.icon}
              {meta.label}
            </ToggleButton>
          </Tooltip>
        );
      })}
    </ToggleButtonGroup>
  );
}
