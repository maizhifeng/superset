// ============================================================
// 指标构建器页面 - 创建和编辑自定义数据指标
// ============================================================

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { metricsAPI, dbAPI } from '../api';
import { useDBStore } from '../store';
import { MetricBuilderSkeleton } from '../components/Skeleton';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  IconButton,
  Button as MuiButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import BarChartIcon from '@mui/icons-material/BarChart';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ScaleIcon from '@mui/icons-material/Scale';
import CodeIcon from '@mui/icons-material/Code';

const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
const isNumeric = (type) => numericTypes.includes(type?.toLowerCase());

export default function MetricBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tables, setTables } = useDBStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [table, setTable] = useState('');
  const [metrics, setMetrics] = useState([{ func: 'SUM', field: '', alias: '', weightField: '' }]);
  const [previewSQL, setPreviewSQL] = useState('');

  const { data: metricConfig } = useQuery({
    queryKey: ['metricConfig'],
    queryFn: metricsAPI.getConfig,
  });

  const { data: existingMetric } = useQuery({
    queryKey: ['metric', id],
    queryFn: () => metricsAPI.get(id),
    enabled: !!id,
  });

  const { data: columnsData } = useQuery({
    queryKey: ['tableColumns', table],
    queryFn: () => dbAPI.getTableColumns(table),
    enabled: !!table,
  });

  const { data: tablesData } = useQuery({
    queryKey: ['tables'],
    queryFn: dbAPI.getTables,
    enabled: tables.length === 0,
  });

  const columns = columnsData?.data || [];
  const availableTables = tables.length > 0 ? tables : (tablesData?.data || []);
  const metricColumns = columns.filter(c => isNumeric(c.data_type));

  useEffect(() => {
    if (tablesData?.data && tables.length === 0) {
      setTables(tablesData.data);
    }
  }, [tablesData, tables.length, setTables]);

  useEffect(() => {
    if (existingMetric?.data) {
      const c = existingMetric.data.config;
      setName(existingMetric.data.name);
      setDescription(existingMetric.data.description || '');
      setTable(c.table || '');
      setMetrics(c.aggregations || [{ func: 'SUM', field: '', alias: '', weightField: '' }]);
    }
  }, [existingMetric]);

  useEffect(() => {
    setMetrics([{ func: 'SUM', field: '', alias: '', weightField: '' }]);
    setPreviewSQL('');
  }, [table]);

  const buildConfig = () => ({
    table,
    aggregations: metrics.filter(m => m.field),
  });

  const previewMutation = useMutation({
    mutationFn: metricsAPI.previewSQL,
    onSuccess: (data) => setPreviewSQL(data.sql),
  });

  const saveMutation = useMutation({
    mutationFn: id ? (data) => metricsAPI.update(id, data) : metricsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries(['metrics']);
      if (id) queryClient.invalidateQueries(['metric', id]);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['metricData'] });
      navigate('/metrics');
    },
  });

  const handlePreview = () => previewMutation.mutate(buildConfig());
  const handleSave = () => saveMutation.mutate({ name, description, config: buildConfig() });

  const aggregations = metricConfig?.aggregations || [];
  const isLoading = !metricConfig;

  if (isLoading) {
    return <MetricBuilderSkeleton />;
  }

  return (
    <Box sx={{ bgcolor: 'background.paper', p: 2, minHeight: '100vh' }}>
      <Box sx={{ maxWidth: '896px', mx: 'auto' }}>
        {/* 头部 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6">{id ? 'Edit Metric' : 'New Metric'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {id ? 'Update your metric configuration' : 'Define a new metric for your dashboards'}
            </Typography>
          </Box>
          <MuiButton
            variant="outlined"
            onClick={() => navigate('/metrics')}
            startIcon={<CloseIcon sx={{ width: 16, height: 16 }} />}
          >
            Cancel
          </MuiButton>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 基本信息 */}
          <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                  opacity: 0.08,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <InfoIcon sx={{ width: 16, height: 16, color: 'primary.main' }} />
              </Box>
              <Box>
                <Typography variant="subtitle2">Basic Information</Typography>
                <Typography variant="caption" color="text.secondary">
                  Name and describe your metric
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
              <TextField
                label="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Total Revenue"
                size="small"
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Data Source</InputLabel>
                <Select
                  value={table}
                  onChange={e => setTable(e.target.value)}
                  label="Data Source"
                  onClose={() => document.activeElement?.blur()}
                >
                  <MenuItem value="">Select table</MenuItem>
                  {availableTables.map(t => (
                    <MenuItem key={t.table_name} value={t.table_name}>{t.table_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <TextField
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)"
              size="small"
              fullWidth
            />
          </Paper>

          {table && (
            <MetricSection
              title="Metrics"
              subtitle="Define the numerical values to calculate"
              items={metrics}
              setItems={setMetrics}
              columns={metricColumns}
              allColumns={columns}
              aggregations={aggregations}
            />
          )}

          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <MuiButton
              variant="outlined"
              onClick={handlePreview}
              disabled={!table || previewMutation.isPending}
              startIcon={<VisibilityIcon sx={{ width: 12, height: 12 }} />}
            >
              Preview SQL
            </MuiButton>
            <MuiButton
              variant="contained"
              onClick={handleSave}
              disabled={!name || saveMutation.isPending}
              startIcon={<CheckIcon sx={{ width: 12, height: 12 }} />}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Metric'}
            </MuiButton>
          </Box>

          {/* 预览SQL */}
          {previewSQL && (
            <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CodeIcon sx={{ width: 12, height: 12, color: 'text.secondary' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    Generated SQL
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => navigator.clipboard?.writeText(previewSQL)}
                  title="Copy to clipboard"
                >
                  <ContentCopyIcon sx={{ width: 12, height: 12, color: 'text.secondary' }} />
                </IconButton>
              </Box>
              <Box
                component="pre"
                sx={{
                  p: 1.5,
                  fontSize: 12,
                  fontFamily: (theme) => theme.typography.fontFamilyMono,
                  bgcolor: 'text.primary',
                  color: 'primary.contrastText',
                  overflowX: 'auto',
                  m: 0,
                }}
              >
                {previewSQL}
              </Box>
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function MetricSection({ title, subtitle, items, setItems, columns, allColumns, aggregations }) {
  const addItem = () => setItems([...items, { func: 'SUM', field: '', alias: '', weightField: '' }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, key, value) => {
    const newItems = [...items];
    newItems[i] = { ...newItems[i], [key]: value };
    // 当切换到非 AVG 时，清空权重字段
    if (key === 'func' && value !== 'AVG') {
      newItems[i].weightField = '';
    }
    setItems(newItems);
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              bgcolor: 'primary.main',
              opacity: 0.08,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChartIcon sx={{ width: 16, height: 16, color: 'primary.main' }} />
          </Box>
          <Box>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
        </Box>
        <MuiButton
          variant="text"
          size="small"
          onClick={addItem}
          sx={{ color: 'primary.main', fontWeight: 500 }}
          startIcon={<AddIcon sx={{ width: 12, height: 12 }} />}
        >
          Add Metric
        </MuiButton>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item, i) => (
          <Box key={i} sx={{ p: 1.5, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ width: 120 }}>
                <Select
                  value={item.func}
                  onChange={e => updateItem(i, 'func', e.target.value)}
                  size="small"
                  onClose={() => document.activeElement?.blur()}
                >
                  {aggregations.map(a => (
                    <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select
                  value={item.field}
                  onChange={e => updateItem(i, 'field', e.target.value)}
                  displayEmpty
                  size="small"
                  onClose={() => document.activeElement?.blur()}
                >
                  <MenuItem value="">Select metric field</MenuItem>
                  <MenuItem value="*">*</MenuItem>
                  {columns.map(c => (
                    <MenuItem key={c.column_name} value={c.column_name}>{c.column_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                value={item.alias}
                onChange={e => updateItem(i, 'alias', e.target.value)}
                placeholder="Alias"
                size="small"
                sx={{ width: 120 }}
              />
              <IconButton
                size="small"
                onClick={() => removeItem(i)}
                sx={{ color: 'error.main', '&:hover': { bgcolor: 'error.main', opacity: 0.15 } }}
                title="Remove"
              >
                <DeleteIcon sx={{ width: 12, height: 12 }} />
              </IconButton>
            </Box>
            {/* 权重字段选择：仅当选择 AVG 时显示 */}
            {item.func === 'AVG' && (
              <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ScaleIcon sx={{ width: 10, height: 10 }} />
                  Weight Field (加权平均)
                </Typography>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select
                    value={item.weightField || ''}
                    onChange={e => updateItem(i, 'weightField', e.target.value)}
                    size="small"
                    onClose={() => document.activeElement?.blur()}
                  >
                    <MenuItem value="">无权重(简单平均)</MenuItem>
                    {allColumns.map(c => (
                      <MenuItem key={c.column_name} value={c.column_name}>{c.column_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        提示: AVG 聚合可选择权重字段进行加权平均计算，如 LTV 按 cohort_size 加权
      </Typography>
    </Paper>
  );
}
