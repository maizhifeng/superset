import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import api from '@/api';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
]);

const CHART_TYPES = ['line', 'bar', 'area', 'pie', 'table', 'big_number', 'big_number_total'];

const chartTypeToECharts: Record<string, string> = {
  line: 'line', bar: 'bar', area: 'line', pie: 'pie',
  big_number: 'bar', big_number_total: 'bar',
};

function normalizeVizType(vt: string): string {
  const KNOWN_VIZ_TYPES = new Set(['line', 'bar', 'area', 'pie', 'table', 'big_number', 'big_number_total']);
  if (KNOWN_VIZ_TYPES.has(vt)) return vt;
  if (vt.startsWith('echarts_timeseries_') || vt === 'echarts_area') return 'line';
  if (vt.startsWith('echarts_')) return vt.replace('echarts_', '');
  return vt;
}

function displayVizType(vt: string): string {
  const mapped = chartTypeToECharts[vt];
  if (mapped) return mapped;
  return normalizeVizType(vt);
}

function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      tooltip: { trigger: 'item' as const },
      grid: undefined,
      animation: true, animationDuration: 300,
      series: [{
        type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'],
        data: Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]).slice(0, 10).map((d: Record<string, unknown>) => ({
          name: String(Object.values(d)[0] || ''), value: Number(Object.values(d)[1] || 0),
        })) : [],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  }

  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const categoryKey = keys[0] || 'category';
  const valueKeys = keys.slice(1).filter(k => typeof rows[0]?.[k] === 'number' || k !== categoryKey);

  const slicedRows = rows.slice(0, 50);
  const xLabels = slicedRows.map(r => String(r[categoryKey] ?? ''));

  const maxXLen = Math.max(...xLabels.map(l => l.length), 0);
  const rotatedExtent = Math.ceil(maxXLen * 7 * Math.sin(Math.PI / 4));

  const allYValues = valueKeys.flatMap(k => slicedRows.map(r => Number(r[k] || 0)).filter(v => Number.isFinite(v)).map(Math.abs));
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) : 0;
  const yLabelChars = Math.max(String(Math.round(yMax)).length, 1);
  const yLabelWidth = yLabelChars * 7;

  const palette = ['#20a7c9', '#ff7f50', '#5ab1ef', '#ffb980', '#d87a80', '#8d98b3', '#e5cf0d', '#97b552'];
  const series = valueKeys.length > 0 ? valueKeys.map((key, i) => ({
    type: echartsType as ('bar' | 'line'),
    name: key,
    data: slicedRows.map(r => Number(r[key] || 0)),
    smooth: vizType === 'area',
    areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
    itemStyle: { color: palette[i % palette.length] },
  })) : [{
    type: echartsType as ('bar' | 'line'),
    name: 'value',
    data: slicedRows.map(r => Number(r[categoryKey] || 0)),
    smooth: vizType === 'area',
    areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
    itemStyle: { color: '#20a7c9' },
  }];

  return {
    tooltip: { trigger: 'axis' as const },
    legend: { type: 'scroll' as const, bottom: 0 },
    grid: {
      left: Math.max(40, Math.min(yLabelWidth + 24, 120)),
      right: 20,
      top: 40,
      bottom: series.length > 1 ? Math.max(50, Math.min(rotatedExtent + 12, 160)) : Math.max(30, Math.min(rotatedExtent + 12, 160)),
    },
    animation: true, animationDuration: 300,
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: { type: 'value' as const },
    series,
  };
}

interface Dataset {
  id: number;
  table_name: string;
}

interface DatasetApiResponse {
  result: Dataset[];
  count: number;
}

interface ChartInitialData {
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  form_data?: string | Record<string, unknown> | null;
}

interface PickerItem {
  value: string;
  label: string;
  group: string;
}

interface PickerDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  selectedCount: number;
  items: PickerItem[];
  getLabel: (item: PickerItem) => string;
  getSubLabel: (item: PickerItem) => string;
  selectedValues: string[];
  onToggle: (value: string) => void;
}

function PickerDrawer({ open, onClose, title, selectedCount, items, getLabel, getSubLabel, selectedValues, onToggle }: PickerDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      keepMounted
      slotProps={{
        paper: { sx: { width: { xs: '100vw', sm: 320 } } },
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">Selected {selectedCount}</Typography>
      </Box>

      <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
        {items.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No options available</Typography>
          </Box>
        ) : (
          items.map(item => {
            const isSelected = selectedValues.includes(item.value);
            return (
              <Box
                key={item.value}
                component="button"
                type="button"
                onClick={() => onToggle(item.value)}
                sx={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, py: 1.5, border: 'none', borderBottom: '1px solid',
                  borderColor: 'divider', cursor: 'pointer', textAlign: 'left',
                  bgcolor: isSelected ? 'action.selected' : 'background.paper',
                  color: 'inherit', minHeight: 48,
                  '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  '&:last-of-type': { borderBottom: 'none' },
                }}
              >
                <Box sx={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                }}>
                  {isSelected && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.contrastText' }} />}
                </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getLabel(item)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', minHeight: '1.25em' }}>{getSubLabel(item) || ' '}</Typography>
                  </Box>
              </Box>
            );
          })
        )}
      </Box>

      <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="outlined" size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" onClick={onClose}>Confirm</Button>
      </Box>
    </Drawer>
  );
}

interface ChartEditorProps {
  onChartSaved?: (chartId: number) => void;
  showPreview?: boolean;
  initialData?: ChartInitialData | null;
}

export default function ChartEditor({ onChartSaved, showPreview = true, initialData }: ChartEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sliceId = searchParams.get('slice_id');

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasourceId, setDatasourceId] = useState('');
  const [vizType, setVizType] = useState('');
  const [metrics, setMetrics] = useState<string[]>([]);
  const [groupby, setGroupby] = useState<string[]>([]);
  const [sliceName, setSliceName] = useState('');

  const [metricsList, setMetricsList] = useState<{ metric_name: string; verbose_name: string | null; expression: string }[]>([]);
  const [columnsList, setColumnsList] = useState<{ column_name: string; type: string | null; expression?: string }[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const fieldOptions = useMemo(() => {
    const items: { value: string; label: string; group: string }[] = [];
    for (const m of metricsList) {
      items.push({ value: m.metric_name, label: m.verbose_name || m.metric_name, group: 'Metrics' });
    }
    for (const c of columnsList) {
      if (!c.column_name) continue;
      items.push({ value: c.column_name, label: c.column_name, group: 'Columns' });
    }
    return items;
  }, [metricsList, columnsList]);

  const metricsOptions = useMemo(() => {
    if (!columnsList.length) return fieldOptions;
    const numericTypes = /int|float|double|decimal|number|bigint|numeric|real/i;
    return fieldOptions.filter(o => {
      if (o.group === 'Metrics') return true;
      const col = columnsList.find(c => c.column_name === o.value);
      if (!col) return false;
      if (col.type && numericTypes.test(col.type)) return true;
      if (!col.type && col.expression) return true;
      return false;
    });
  }, [fieldOptions, columnsList]);
  const chartTypeOptions = useMemo(() => {
    if (!vizType || CHART_TYPES.includes(vizType)) return CHART_TYPES;
    return [...CHART_TYPES, vizType];
  }, [vizType]);
  const [chartData, setChartData] = useState<Record<string, unknown> | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMetricPicker, setShowMetricPicker] = useState(false);
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [showChartTypePicker, setShowChartTypePicker] = useState(false);

  const isEditing = Boolean(sliceId);
  const abortRef = useRef<AbortController | null>(null);

  const metricNames = useMemo(() => new Set(metricsList.map(m => m.metric_name)), [metricsList]);

  function buildMetricsPayload(selected: string[]): unknown[] {
    return selected.map(m => {
      if (metricNames.has(m)) return m;
      return { expressionType: 'SIMPLE', column: { column_name: m }, aggregate: 'SUM', label: `SUM(${m})` };
    });
  }

  useEffect(() => {
    api
      .get<DatasetApiResponse>('/dataset/?q=(page_size:200,page:0)')
      .then(res => {
        setDatasets(res.data.result);
        setLoadingDatasets(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load datasets');
        setLoadingDatasets(false);
      });
  }, []);

  useEffect(() => {
    if (initialData) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ''));
      let parsed: Record<string, unknown> = {};
      const raw = initialData.form_data;
      try {
        parsed =
          typeof raw === 'string' ? JSON.parse(raw || '{}') :
          typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
      } catch { /* form_data not parseable */ }
      const g = parsed.groupby;
      if (Array.isArray(g)) setGroupby(g as string[]);
      const m = parsed.metrics ?? parsed.metric;
      if (Array.isArray(m)) {
        setMetrics(m.map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') return ((item as Record<string, unknown>).column as Record<string, unknown> | undefined)?.column_name as string || '';
          return '';
        }).filter(Boolean));
      } else if (typeof m === 'string') {
        setMetrics([m]);
      }
      setLoadingChart(false);
      return;
    }
    if (!sliceId) return;
    setLoadingChart(true);
    api.get(`/chart/?q=(page_size:1,filters:!((col:id,opr:eq,value:${sliceId})))`)
      .then(res => {
        const charts = (res.data?.result ?? []) as Record<string, unknown>[];
        if (charts.length === 0) throw new Error('Chart not found');
        const chart = charts[0];
        setSliceName(String(chart.slice_name ?? ''));
        setVizType(String(chart.viz_type ?? ''));
        setDatasourceId(String(chart.datasource_id ?? ''));
        try {
          const raw = (chart.params ?? chart.form_data) as string | Record<string, unknown> | undefined;
          const parsed: Record<string, unknown> =
            typeof raw === 'string' ? JSON.parse(raw || '{}') :
            typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
          const g = parsed.groupby;
          if (Array.isArray(g)) setGroupby(g as string[]);
          const m = parsed.metrics ?? parsed.metric;
          if (Array.isArray(m)) {
            setMetrics(m.map((item: unknown) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object') return ((item as Record<string, unknown>).column as Record<string, unknown> | undefined)?.column_name as string || '';
              return '';
            }).filter(Boolean));
          } else if (typeof m === 'string') {
            setMetrics([m]);
          }
        } catch { /* params not parseable */ }
      })
      .catch(err => {
        setError(err?.response?.data?.message ?? err?.message ?? 'Failed to load chart');
      })
      .finally(() => setLoadingChart(false));
  }, [sliceId, initialData]);

  useEffect(() => {
    if (!datasourceId) { setColumnsList([]); setMetricsList([]); return; }
    setLoadingColumns(true);
    api.get(`/dataset/${datasourceId}`)
      .then(res => {
        const r = res.data?.result ?? {};
        const cols = (r.columns ?? []) as { column_name: string; type: string | null }[];
        const mets = (r.metrics ?? []) as { metric_name: string; verbose_name: string | null; expression: string }[];
        setColumnsList(cols);
        setMetricsList(mets);
      })
      .catch(() => { setColumnsList([]); setMetricsList([]); })
      .finally(() => setLoadingColumns(false));
  }, [datasourceId]);

  const previewParams = useMemo(() => {
    if (!datasourceId || !vizType) return null;
    return {
      datasource_id: Number(datasourceId),
      viz_type: vizType,
      metrics,
      groupby,
    };
  }, [datasourceId, vizType, metrics, groupby]);

  useEffect(() => {
    if (!showPreview) return;
    if (abortRef.current) abortRef.current.abort();
    setChartData(null);

    if (!previewParams) return;

    if (previewParams.metrics.length === 0 || loadingColumns || metricNames.size === 0) {
      setLoadingData(false);
      setChartData({});
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingData(true);

    const query: Record<string, unknown> = { result_type: 'full' };
    query.metrics = buildMetricsPayload(previewParams.metrics);
    if (previewParams.groupby.length > 0) query.groupby = previewParams.groupby;

    api.post('/chart/data', {
      datasource: { id: previewParams.datasource_id, type: 'table' },
      queries: [query],
    }, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const result = res.data?.result;
        const rowData = Array.isArray(result) ? (result[0] || {}) : (result || {});
        setChartData(rowData);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error('Chart data POST error:', err?.response?.data || err?.message || err);
        setChartData({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingData(false);
      });

    return () => controller.abort();
  }, [previewParams, loadingColumns, metricNames, showPreview]);

  const option = useMemo(() => {
    if (!chartData || !vizType) return null;
    if (vizType === 'table') return null;
    return buildEChartsOption(vizType, chartData);
  }, [chartData, vizType]);

  const bigNumberValue = useMemo(() => {
    if (!chartData?.data) return null;
    const rows = Array.isArray(chartData.data) ? (chartData.data as Record<string, unknown>[]) : [];
    if (rows.length === 0) return null;
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
      const val = rows[0][key];
      if (typeof val === 'number') return val.toLocaleString();
      const num = Number(val);
      if (!isNaN(num)) return num.toLocaleString();
    }
    return null;
  }, [chartData]);

  const handleSubmit = async () => {
    if (!datasourceId || !vizType) return;

    setCreating(true);
    setError(null);

    try {
      const selectedDataset = datasets.find(d => d.id === Number(datasourceId));

      const body = {
        slice_name: sliceName || selectedDataset?.table_name || 'Untitled',
        viz_type: vizType,
        datasource_id: Number(datasourceId),
        datasource_type: 'table',
        params: JSON.stringify({
          metrics: buildMetricsPayload(metrics),
          groupby,
          viz_type: vizType,
        }),
      };

      let savedId: number | null = null;
      if (isEditing) {
        await api.put(`/chart/${sliceId}`, body);
        savedId = Number(sliceId);
      } else {
        const res = await api.post('/chart/', body);
        savedId = res.data?.id ?? null;
      }

      if (onChartSaved && savedId) {
        onChartSaved(savedId);
      } else {
        navigate('/chart/list');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message ?? err?.message ?? 'Failed to save chart';
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {loadingChart && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && !loadingChart && (
        <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>
          {error}
        </Alert>
      )}

      {!loadingChart && (
        <>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              fullWidth
              placeholder="Chart name..."
              value={sliceName}
              onChange={e => setSliceName(e.target.value)}
              variant="standard"
              sx={{ '& .MuiInputBase-input': { fontWeight: 600, fontSize: '1.1rem', py: 0.5 } }}
            />
          </Box>

          <Box sx={{ px: 2, py: 2, overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <CardHeader
                sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Data Source</Typography>}
              />
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', cursor: 'pointer', minHeight: 48 }} onClick={() => !loadingDatasets && setShowDatasetPicker(true)}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', flexShrink: 0 }}>Dataset</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                    {loadingDatasets ? 'Loading...' : datasets.find(d => String(d.id) === datasourceId)?.table_name || 'Select'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Card elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <CardHeader
                sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Chart Type</Typography>}
              />
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', cursor: 'pointer', minHeight: 48 }} onClick={() => setShowChartTypePicker(true)}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', flexShrink: 0 }}>Type</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>{vizType ? displayVizType(vizType).replace(/_/g, ' ') : 'Select'}</Typography>
                </Box>
              </CardContent>
            </Card>

            <Card elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <CardHeader
                sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Metrics</Typography>}
                action={
                  !loadingColumns ? (
                    <Button size="small" variant="outlined" onClick={() => setShowMetricPicker(true)} sx={{ mr: 1, minHeight: 32, fontSize: '0.8rem' }}>+ Add</Button>
                  ) : undefined
                }
              />
              <CardContent sx={{ p: 2 }}>
                {loadingColumns ? (
                  <CircularProgress size={16} />
                ) : metrics.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">Select at least one metric</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {metrics.map(m => (
                      <Chip key={m} label={m} size="small" onDelete={() => setMetrics(prev => prev.filter(v => v !== m))} sx={{ minHeight: 28 }} />
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>

            <Card elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <CardHeader
                sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Group By</Typography>}
                action={
                  !loadingColumns ? (
                    <Button size="small" variant="outlined" onClick={() => setShowDimensionPicker(true)} sx={{ mr: 1, minHeight: 32, fontSize: '0.8rem' }}>+ Add</Button>
                  ) : undefined
                }
              />
              <CardContent sx={{ p: 2 }}>
                {loadingColumns ? (
                  <CircularProgress size={16} />
                ) : groupby.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">No dimensions selected</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {groupby.map(g => (
                      <Chip key={g} label={g} size="small" onDelete={() => setGroupby(prev => prev.filter(v => v !== g))} sx={{ minHeight: 28 }} />
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSubmit} disabled={creating || !datasourceId || !vizType} sx={{ minHeight: 40, minWidth: 100 }}>
              {creating ? <CircularProgress size={20} /> : isEditing ? 'Save' : 'Create'}
            </Button>
          </Box>
        </>
      )}

      <PickerDrawer
        open={showMetricPicker}
        onClose={() => setShowMetricPicker(false)}
        title="Select Metrics"
        selectedCount={metrics.length}
        items={metricsOptions}
        getLabel={o => o.label}
        getSubLabel={o => o.group}
        selectedValues={metrics}
        onToggle={val => setMetrics(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])}
      />

      <PickerDrawer
        open={showDimensionPicker}
        onClose={() => setShowDimensionPicker(false)}
        title="Select Group By"
        selectedCount={groupby.length}
        items={fieldOptions}
        getLabel={o => o.label}
        getSubLabel={o => o.group}
        selectedValues={groupby}
        onToggle={val => setGroupby(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])}
      />

      <PickerDrawer
        open={showDatasetPicker}
        onClose={() => setShowDatasetPicker(false)}
        title="Select Datasource"
        selectedCount={datasourceId ? 1 : 0}
        items={datasets.map(d => ({ value: String(d.id), label: d.table_name, group: '' }))}
        getLabel={o => o.label}
        getSubLabel={() => ''}
        selectedValues={datasourceId ? [datasourceId] : []}
        onToggle={val => setDatasourceId(datasourceId === val ? '' : val)}
      />

      <PickerDrawer
        open={showChartTypePicker}
        onClose={() => setShowChartTypePicker(false)}
        title="Select Chart Type"
        selectedCount={vizType ? 1 : 0}
        items={chartTypeOptions.map(ct => ({ value: ct, label: ct.replace(/_/g, ' '), group: '' }))}
        getLabel={o => o.label}
        getSubLabel={() => ''}
        selectedValues={vizType ? [vizType] : []}
        onToggle={val => setVizType(vizType === val ? '' : val)}
      />

      {showPreview && (
          <Paper sx={{ width: '65%', p: 3, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
            <Typography variant="h6">Chart Preview</Typography>

            {!previewParams ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Select a datasource and chart type to see a preview
                </Typography>
              </Box>
            ) : metrics.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Select at least one metric to preview
                </Typography>
              </Box>
            ) : loadingData && !chartData ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <CircularProgress />
              </Box>
            ) : vizType === 'table' ? (
              <TableContainer sx={{ flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Table stickyHeader size="small">
                  {(() => {
                    const rows = Array.isArray(chartData?.data) ? (chartData.data as Record<string, unknown>[]) : [];
                    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
                    return (
                      <>
                        <TableHead>
                          <TableRow>
                            {keys.map(k => <TableCell key={k} sx={{ fontWeight: 600 }}>{k}</TableCell>)}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={keys.length || 1} align="center">
                                <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                                  No data returned
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ) : (
                            rows.slice(0, 100).map((row, i) => (
                              <TableRow key={i}>
                                {keys.map(k => <TableCell key={k}>{String(row[k] ?? '')}</TableCell>)}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </>
                    );
                  })()}
                </Table>
              </TableContainer>
            ) : bigNumberValue && (vizType === 'big_number' || vizType === 'big_number_total') ? (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="h2" sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '3rem' }, lineHeight: 1.2 }}>
                  {bigNumberValue}
                </Typography>
              </Box>
            ) : option ? (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <ReactEChartsCore
                  echarts={echarts}
                  option={option}
                  style={{ height: '100%', width: '100%', minHeight: 300 }}
                  notMerge
                  lazyUpdate
                />
              </Box>
            ) : chartData ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  No data returned
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <CircularProgress />
              </Box>
            )}
          </Paper>
          )}
        </Box>
  );
}
