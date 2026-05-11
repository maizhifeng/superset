import React from 'react';
import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Chip from '@mui/material/Chip';
import TableChartIcon from '@mui/icons-material/TableChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';

const METRICS = [
  { value: 'retention_rate', label: '留存率' },
  { value: 'ltv', label: 'LTV' },
  { value: 'ltv_multiplier', label: 'LTV倍率' },
];

export default function CohortMetricSwitcher({ currentMetric, onChange, viewMode, onViewChange }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flexGrow: 1 }}>
        {METRICS.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            variant={currentMetric === m.value ? 'filled' : 'outlined'}
            color={currentMetric === m.value ? 'primary' : 'default'}
            onClick={() => onChange(m.value)}
            size="small"
            sx={{ cursor: 'pointer', fontWeight: currentMetric === m.value ? 600 : 400 }}
          />
        ))}
      </Box>
      <ToggleButtonGroup
        value={viewMode}
        exclusive
        onChange={(e, val) => val && onViewChange(val)}
        size="small"
      >
        <ToggleButton value="table">
          <TableChartIcon fontSize="small" />
        </ToggleButton>
        <ToggleButton value="chart">
          <ShowChartIcon fontSize="small" />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
