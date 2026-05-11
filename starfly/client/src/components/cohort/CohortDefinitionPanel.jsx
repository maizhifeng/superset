import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { useCohortStore } from '../../store/cohortStore';
import CohortDimensionFilter from './CohortDimensionFilter';


const PERIOD_OPTIONS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
];

const METRIC_OPTIONS = [
  { value: 'retention_rate', label: '留存率' },
  { value: 'ltv', label: 'LTV' },
  { value: 'ltv_multiplier', label: 'LTV倍率' },
];

const DATE_FIELD_OPTIONS = [
  { value: 'registration_date', label: '注册日期' },
  { value: 'first_purchase_date', label: '首次付费日期' },
];

export default function CohortDefinitionPanel({ onRun, isLoading }) {
  const config = useCohortStore((s) => s.config);
  const setConfig = useCohortStore((s) => s.setConfig);
  const setUploadModalOpen = useCohortStore((s) => s.setUploadModalOpen);

  return (
    <Box sx={{
      width: 240,
      minWidth: 240,
      borderRight: '1px solid',
      borderColor: 'divider',
      p: 1.5,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      overflow: 'auto',
    }}>
      {/* Cohort Date Field */}
      <FormControl size="small" fullWidth>
        <InputLabel>事件日期</InputLabel>
        <Select
          value={config.cohortDateField}
          label="事件日期"
          onChange={(e) => setConfig({ cohortDateField: e.target.value })}
        >
          {DATE_FIELD_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Cohort Period */}
      <FormControl size="small" fullWidth>
        <InputLabel>周期</InputLabel>
        <Select
          value={config.cohortPeriod}
          label="周期"
          onChange={(e) => setConfig({ cohortPeriod: e.target.value })}
        >
          {PERIOD_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Metric */}
      <FormControl size="small" fullWidth>
        <InputLabel>指标</InputLabel>
        <Select
          value={config.metric}
          label="指标"
          onChange={(e) => setConfig({ metric: e.target.value })}
        >
          {METRIC_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Date Mode Toggle */}
      <ToggleButtonGroup
        value={config.dateMode}
        exclusive
        onChange={(e, val) => val && setConfig({ dateMode: val })}
        size="small"
        fullWidth
      >
        <ToggleButton value="absolute" sx={{ fontSize: '0.7rem', py: 0.3 }}>绝对日期</ToggleButton>
        <ToggleButton value="relative" sx={{ fontSize: '0.7rem', py: 0.3 }}>相对周期</ToggleButton>
      </ToggleButtonGroup>

      {/* Date Range - Absolute Mode */}
      {config.dateMode === 'absolute' && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <DatePicker
            label="开始"
            value={config.dateRange?.start ? dayjs(config.dateRange.start) : null}
            onChange={(date) => setConfig({ dateRange: { ...config.dateRange, start: date?.format('YYYY-MM-DD') } })}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
          <DatePicker
            label="结束"
            value={config.dateRange?.end ? dayjs(config.dateRange.end) : null}
            onChange={(date) => setConfig({ dateRange: { ...config.dateRange, end: date?.format('YYYY-MM-DD') } })}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Box>
      )}

      {/* Date Range - Relative Mode */}
      {config.dateMode === 'relative' && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label={`起始${config.cohortPeriod === 'day' ? '日' : config.cohortPeriod === 'month' ? '月' : '周'}`}
            type="number"
            size="small"
            value={config.relativeConfig?.startPeriod ?? 1}
            onChange={(e) => setConfig({ relativeConfig: { ...config.relativeConfig, startPeriod: Math.max(1, parseInt(e.target.value) || 1) } })}
            slotProps={{ htmlInput: { min: 1 } }}
          />
          <TextField
            label={`结束${config.cohortPeriod === 'day' ? '日' : config.cohortPeriod === 'month' ? '月' : '周'}`}
            type="number"
            size="small"
            value={config.relativeConfig?.endPeriod ?? 12}
            onChange={(e) => setConfig({ relativeConfig: { ...config.relativeConfig, endPeriod: Math.max(1, parseInt(e.target.value) || 1) } })}
            slotProps={{ htmlInput: { min: 1 } }}
          />
        </Box>
      )}

      {/* Dimensions */}
      <CohortDimensionFilter
        selected={config.dimensions}
        onChange={(dims) => setConfig({ dimensions: dims })}
        filters={config.dimensionFilters || {}}
        onFilterChange={(f) => setConfig({ dimensionFilters: f })}
      />

      {/* Filter first X days */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={config.firstXDaysEnabled}
              onChange={(e) => setConfig({ firstXDaysEnabled: e.target.checked })}
            />
          }
          label={<Typography variant="body2">过滤首X日</Typography>}
        />
        {config.firstXDaysEnabled && (
          <TextField
            type="number"
            size="small"
            fullWidth
            value={config.firstXDays}
            onChange={(e) => setConfig({ firstXDays: Math.max(1, parseInt(e.target.value) || 1) })}
            slotProps={{ htmlInput: { min: 1 } }}
            sx={{ mt: 0.5 }}
          />
        )}
      </Box>

      {/* Run Button */}
      <Button
        variant="contained"
        color="primary"
        size="small"
        startIcon={<PlayArrowIcon />}
        onClick={onRun}
        disabled={isLoading}
        fullWidth
      >
        {isLoading ? '分析中...' : '运行分析'}
      </Button>

      {/* Upload CSV */}
      <Button
        variant="outlined"
        size="small"
        onClick={() => setUploadModalOpen(true)}
        fullWidth
        sx={{ fontSize: '0.75rem' }}
      >
        上传CSV
      </Button>
    </Box>
  );
}
