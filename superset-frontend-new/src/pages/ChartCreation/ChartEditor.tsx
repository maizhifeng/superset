import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import SaveIcon from '@mui/icons-material/Save';
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
import { useToolbarStore } from '@/contexts/ToolbarContext';
import ChartTypeSelector from './ChartTypeSelector';
import PickerField from './PickerField';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
]);

const chartTypeToECharts: Record<string, string> = {
  auto: 'auto', line: 'line', bar: 'bar', pie: 'pie',
  big_number: 'bar',
};

function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      tooltip: { trigger: 'item' as const },
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
  const isTimeAxis = /year|date|time/i.test(categoryKey);
  const xLabels = slicedRows.map(r => {
    const v = r[categoryKey];
    if (isTimeAxis && typeof v === 'number' && !isNaN(v)) {
      const d = new Date(v);
      const y = d.getFullYear();
      if (y > 1900 && y < 2100) return d.toLocaleDateString();
    }
    return String(v ?? '');
  });

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
    itemStyle: { color: palette[i % palette.length] },
  })) : [{
    type: echartsType as ('bar' | 'line'),
    name: 'value',
    data: slicedRows.map(r => Number(r[categoryKey] || 0)),
    itemStyle: { color: '#20a7c9' },
  }];

  return {
    tooltip: { trigger: 'axis' as const },
    legend: series.length > 1 ? { type: 'scroll' as const, bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
    grid: {
      left: Math.max(40, Math.min(yLabelWidth + 24, 120)),
      right: 20,
      top: 40,
      bottom: series.length > 1 ? Math.max(60, Math.min(rotatedExtent + 24, 160)) : Math.max(30, Math.min(rotatedExtent + 12, 100)),
    },
    animation: true, animationDuration: 300,
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLabel: { rotate: 45, fontSize: 10, margin: 8 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        formatter: (v: number) => {
          if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
          if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
          if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
          return String(v);
        },
      },
    },
    series,
  };
}

interface Dataset { id: number; table_name: string }
interface DatasetApiResponse { result: Dataset[]; count: number }

interface ChartInitialData {
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  form_data?: string | Record<string, unknown> | null;
  params?: string | Record<string, unknown> | null;
}

interface FieldOption { value: string; label: string; group: string }

function autoSuggestChartType(
  metrics: string[],
  columnsList: { column_name: string; type: string | null }[],
  groupby: string[],
): { vizType: string; groupby: string[] } {
  const metricCount = metrics.length;
  if (metricCount === 0) return { vizType: 'table', groupby: [] };
  if (metricCount >= 4) return { vizType: 'table', groupby: [] };
  if (groupby.length >= 3) return { vizType: 'table', groupby: [groupby[0]] };

  if (groupby.length === 0) {
    if (metricCount === 1) return { vizType: 'big_number', groupby: [] };
    if (metricCount >= 2) return { vizType: 'line', groupby: [] };
  }

  const numericTypes = /int|float|double|decimal|number|bigint|numeric|real/i;
  const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
  const dimColumns = columnsList.filter(c => {
    if (!c.type) return true;
    if (timeTypes.test(c.type) || timeTypes.test(c.column_name)) return false;
    return !numericTypes.test(c.type);
  });
  const timeCols = columnsList.filter(c =>
    (c.type && timeTypes.test(c.type)) || timeTypes.test(c.column_name),
  );

  if (metricCount === 1 && dimColumns.length === 1) {
    const dimName = dimColumns[0].column_name;
    const isTime = timeCols.some(c => c.column_name === dimName);
    return { vizType: isTime ? 'line' : 'bar', groupby: [dimName] };
  }
  if (metricCount === 1 && dimColumns.length > 1) {
    const firstDim = timeCols.length > 0 ? timeCols[0].column_name : dimColumns[0].column_name;
    return { vizType: 'line', groupby: [firstDim] };
  }
  if (metricCount >= 2 && dimColumns.length >= 1) {
    return { vizType: 'bar', groupby: [dimColumns[0].column_name] };
  }
  if (metricCount === 1 && dimColumns.length === 0) {
    return { vizType: 'big_number', groupby: [] };
  }
  if (metricCount >= 2 && dimColumns.length === 0) {
    return { vizType: 'line', groupby: [] };
  }
  return { vizType: 'bar', groupby: dimColumns.length > 0 ? [dimColumns[0].column_name] : [] };
}

interface ChartEditorProps {
  onChartSaved?: (chartId: number) => void;
  showPreview?: boolean;
  initialData?: ChartInitialData | null;
  compact?: boolean;
}

export default function ChartEditor({ onChartSaved, initialData, compact }: ChartEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sliceId = searchParams.get('slice_id');

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasourceId, setDatasourceId] = useState('');
  const [vizType, setVizType] = useState('auto');
  const [metrics, setMetrics] = useState<string[]>([]);
  const [groupby, setGroupby] = useState<string[]>([]);
  const [sliceName, setSliceName] = useState('');

  const [metricsList, setMetricsList] = useState<{ metric_name: string; verbose_name: string | null; expression: string }[]>([]);
  const [columnsList, setColumnsList] = useState<{ column_name: string; type: string | null; expression?: string }[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [suggested, setSuggested] = useState<{ vizType: string; groupby: string[] } | null>(null);
  const [userChangedType, setUserChangedType] = useState(false);

  const fieldOptions = useMemo(() => {
    const items: FieldOption[] = [];
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

  const dimensionOptions = useMemo(() => {
    if (!columnsList.length) return [];
    return columnsList
      .map(c => ({ value: c.column_name, label: c.column_name, group: 'Dimensions' }));
  }, [columnsList]);

  const [chartData, setChartData] = useState<Record<string, unknown> | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(sliceId || initialData?.datasource_id);
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);
  const abortRef = useRef<AbortController | null>(null);
  const metricNames = useMemo(() => new Set(metricsList.map(m => m.metric_name)), [metricsList]);

  function buildMetricsPayload(selected: string[]): unknown[] {
    return selected.map(m => {
      if (metricNames.has(m)) return m;
      return { expressionType: 'SIMPLE', column: { column_name: m }, aggregate: 'SUM', label: `SUM(${m})` };
    });
  }

  const handleMetricsChange = (v: string[]) => {
    if (v.length === 0 && metricsList.length > 0) {
      setMetrics(metricsList.map(m => m.metric_name));
    } else {
      setMetrics(v);
    }
  };

  useEffect(() => {
    api.get<DatasetApiResponse>('/dataset/?q=(page_size:200,page:0)')
      .then(res => {
        setDatasets(res.data.result);
        setLoadingDatasets(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load datasets');
        setLoadingDatasets(false);
      });
  }, []);

  function restoreFormData(raw: string | Record<string, unknown> | null | undefined) {
    if (!raw) return;
    let parsed: Record<string, unknown> = {};
    try {
      parsed =
        typeof raw === 'string' ? JSON.parse(raw || '{}') :
        typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    } catch { return; }
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
  }

  useEffect(() => {
    if (initialData) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ''));
      const raw = initialData.form_data || initialData.params || null;
      restoreFormData(raw);
      setLoadingChart(false);
      return;
    }
    if (!sliceId) return;
    setLoadingChart(true);
    api.get(`/chart/${sliceId}`)
      .then(res => {
        const chart = res.data?.result as Record<string, unknown> | undefined;
        if (!chart) return;
        setSliceName(String(chart.slice_name ?? ''));
        setVizType(String(chart.viz_type ?? ''));
        setDatasourceId(String(chart.datasource_id ?? ''));
        const raw = (chart.params || chart.form_data) as string | Record<string, unknown> | undefined;
        restoreFormData(raw ?? null);
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
        if (!isEditing) {
          setMetrics(mets.map(m => m.metric_name));
        }
      })
      .catch(() => { setColumnsList([]); setMetricsList([]); })
      .finally(() => setLoadingColumns(false));
  }, [datasourceId]);

  useEffect(() => {
    if (loadingColumns) {
      setSuggested(null);
      return;
    }
    if (metrics.length === 0) return;
    const s = autoSuggestChartType(metrics, columnsList, groupby);
    setSuggested(s);
    if (!userChangedType && vizType === 'auto' && !isEditing) {
      setVizType(s.vizType);
    }
  }, [metrics, columnsList, loadingColumns, groupby, vizType, userChangedType]);

  const resolvedType = vizType === 'auto' && suggested ? suggested.vizType : vizType;
  const hasValidType = resolvedType && resolvedType !== 'auto';

  const previewParams = useMemo(() => {
    if (!datasourceId || !hasValidType) return null;
    return {
      datasource_id: Number(datasourceId),
      viz_type: resolvedType,
      metrics,
      groupby,
    };
  }, [datasourceId, resolvedType, metrics, groupby]);

  useEffect(() => {
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
        setChartData({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingData(false);
      });

    return () => controller.abort();
  }, [previewParams, loadingColumns, metricNames]);

  const option = useMemo(() => {
    if (!chartData || !resolvedType || resolvedType === 'auto') return null;
    if (resolvedType === 'table') return null;
    return buildEChartsOption(resolvedType, chartData);
  }, [chartData, resolvedType]);

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

  const pieDisabled = useMemo(() => {
    if (groupby.length >= 2) return true;
    if (groupby.length === 1 && chartData?.data) {
      const rows = Array.isArray(chartData.data) ? (chartData.data as Record<string, unknown>[]) : [];
      const dimKey = groupby[0];
      const isTimeKey = /year|date|time/i.test(dimKey);
      const uniqueVals = new Set(rows.map(r => {
        const v = r[dimKey];
        if (isTimeKey && typeof v === 'number') {
          const d = new Date(v);
          const y = d.getFullYear();
          if (y > 1900 && y < 2100) return d.toLocaleDateString();
        }
        return v;
      }));
      if (uniqueVals.size > 6) return true;
    }
    return false;
  }, [groupby, chartData]);

  const hasGroupBy = groupby.length > 0;

  const disabledReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    if (metrics.length === 0) {
      reasons['line'] = 'No metrics selected';
      reasons['bar'] = 'No metrics selected';
      reasons['pie'] = 'No metrics selected';
      reasons['big_number'] = 'No metrics selected';
    }
    if (pieDisabled) {
      const parts: string[] = [];
      if (groupby.length >= 2) parts.push('multiple dimensions selected');
      if (pieDisabled && !parts.length) parts.push('dimension has >6 unique values');
      reasons['pie'] = `Pie not available: ${parts.join(', ')}`;
    }
    if (hasGroupBy || metrics.length !== 1) {
      reasons['big_number'] = 'Big Number requires 1 metric with no grouping';
    }
    return reasons;
  }, [metrics.length, hasGroupBy, pieDisabled, groupby.length]);

  useEffect(() => {
    if (disabledReasons[vizType] && suggested) {
      setVizType(suggested.vizType);
    }
  }, [disabledReasons, vizType, suggested]);

  const handleSubmit = useCallback(async () => {
    if (!datasourceId || !hasValidType) return;
    setCreating(true);
    setError(null);
    try {
      const selectedDataset = datasets.find(d => d.id === Number(datasourceId));
      const effectiveType = resolvedType === 'auto' ? 'line' : resolvedType;
      const body = {
        slice_name: sliceName || selectedDataset?.table_name || 'Untitled',
        viz_type: effectiveType,
        datasource_id: Number(datasourceId),
        datasource_type: 'table',
        params: JSON.stringify({
          metrics: buildMetricsPayload(metrics),
          groupby,
          viz_type: effectiveType,
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
  }, [datasourceId, hasValidType, datasets, resolvedType, sliceName, metricNames, metrics, groupby, isEditing, sliceId, onChartSaved, navigate]);

  useEffect(() => {
    registerTools('chart_editor', [
      {
        id: 'save',
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <SaveIcon />,
        fabLabel: isEditing ? 'Save' : 'Create',
        action: handleSubmit,
        render: (
          <Button
            variant="contained"
            size="small"
            onClick={handleSubmit}
            disabled={creating || !datasourceId || !hasValidType}
            sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
          >
            {creating ? <CircularProgress size={16} /> : isEditing ? 'Save' : 'Create'}
          </Button>
        ),
      },
    ]);
    return () => unregisterTools('chart_editor');
  }, [registerTools, unregisterTools, handleSubmit, creating, datasourceId, hasValidType, isEditing]);

  const handleChartTypeChange = (val: string) => {
    setVizType(val);
    setUserChangedType(val !== 'auto');
  };

  const preview = (
    <Box sx={{ flex: { md: 1 }, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {datasourceId && (
          <ChartTypeSelector
            value={vizType}
            suggested={suggested?.vizType}
            disabledReasons={disabledReasons}
            onChange={handleChartTypeChange}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minHeight: 200, overflow: 'hidden' }}>
        {!datasourceId ? (
          <Typography variant="body2" color="text.disabled">Select a dataset to see preview</Typography>
        ) : !hasValidType ? (
          <Typography variant="body2" color="text.disabled">Analyzing data for best chart type...</Typography>
        ) : metrics.length === 0 ? (
          <Typography variant="body2" color="text.disabled">Select at least one metric</Typography>
        ) : loadingData && !chartData ? (
          <CircularProgress size={24} />
        ) : resolvedType === 'table' ? (
          <TableContainer sx={{ width: '100%', height: '100%', overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ '& .MuiTableCell-head': { fontWeight: 700, fontSize: '0.75rem', color: 'text.primary', bgcolor: 'grey.100' } }}>
              {(() => {
                const rows = Array.isArray(chartData?.data) ? (chartData.data as Record<string, unknown>[]) : [];
                const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
                const fmt = (key: string, val: unknown): string => {
                  if (val === null || val === undefined) return '';
                  if (typeof val === 'number' && /year|date|time/i.test(key)) {
                    const d = new Date(val);
                    const y = d.getFullYear();
                    if (y > 1900 && y < 2100) return d.toLocaleDateString();
                  }
                  return String(val);
                };
                return (
                  <>
                    <TableHead>
                      <TableRow>
                        {keys.map(k => <TableCell key={k} sx={{ fontWeight: 700, fontSize: '0.75rem' }}>{k}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={keys.length || 1} align="center">
                            <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: 'block' }}>No data</Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.slice(0, 50).map((row, i) => (
                          <TableRow key={i}>
                            {keys.map(k => <TableCell key={k} sx={{ fontSize: '0.75rem' }}>{fmt(k, row[k])}</TableCell>)}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </>
                );
              })()}
            </Table>
          </TableContainer>
        ) : bigNumberValue && resolvedType === 'big_number' ? (
          <Typography variant="h2" sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '3rem' }, lineHeight: 1.2 }}>
            {bigNumberValue}
          </Typography>
        ) : option ? (
          <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height: '100%', width: '100%', minHeight: 250 }}
            notMerge
            lazyUpdate
          />
        ) : chartData ? (
          <Typography variant="body2" color="text.disabled">No data returned</Typography>
        ) : (
          <CircularProgress size={24} />
        )}
      </Box>
    </Box>
  );

  if (loadingChart) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  const c = (full: number | string, comp: number | string) => compact ? comp : full;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {error && (
        <Alert severity="error" sx={{ mx: c(2, 1.5), mt: c(2, 1.5), flexShrink: 0 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: c(1, 0.75), px: c(2, 1), py: c(1, 0.5), borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: c(1, 0.75) }}>
          <Card elevation={0} sx={{ flex: '0 0 180px', borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <CardHeader sx={{ px: c(1, 0.75), py: c(0.5, 0.25), bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
              title={<Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: compact ? '0.6rem' : undefined }}>Name</Typography>}
            />
            <CardContent sx={{ p: c(1, 0.75) }}>
              <TextField
                placeholder="Chart name..."
                value={sliceName}
                onChange={e => setSliceName(e.target.value)}
                variant="standard"
                sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: '1.5rem', fontWeight: 600 } }}
              />
            </CardContent>
          </Card>

          <Card elevation={0} sx={{ flex: '2 1 280px', borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <CardHeader sx={{ px: c(1, 0.75), py: c(0.5, 0.25), bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
            title={<Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: compact ? '0.6rem' : undefined }}>Dataset</Typography>}
          />
          <CardContent sx={{ p: c(1, 0.75) }}>
            <PickerField
              label="Dataset"
              options={datasets.map(d => ({ value: String(d.id), label: d.table_name }))}
              selected={datasourceId ? [datasourceId] : []}
              onChange={vals => { setDatasourceId(vals[0] || ''); setMetrics([]); setGroupby([]); setUserChangedType(false); }}
              loading={loadingDatasets}
              placeholder="Select dataset..."
              singleSelect
              hideGroups
              hideHeader
            />
          </CardContent>
        </Card>
        </Box>

        {datasourceId && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: c(1, 0.75) }}>
            <Card elevation={0} sx={{ flex: '1 1 40%', minWidth: c(150, 120), borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <CardHeader sx={{ px: c(1, 0.75), py: c(0.5, 0.25), bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: compact ? '0.6rem' : undefined }}>Metrics</Typography>}
              />
              <CardContent sx={{ p: c(1, 0.75) }}>
                {loadingColumns ? (
                  <CircularProgress size={16} />
                ) : (
                    <PickerField
                      label="Metrics"
                      options={metricsOptions}
                      selected={metrics}
                      onChange={handleMetricsChange}
                      placeholder="Add metrics..."
                      hideHeader
                      hideGroups
                    />
                )}
              </CardContent>
            </Card>

            <Card elevation={0} sx={{ flex: '1 1 40%', minWidth: c(150, 120), borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <CardHeader sx={{ px: c(1, 0.75), py: c(0.5, 0.25), bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
                title={<Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: compact ? '0.6rem' : undefined }}>Group By</Typography>}
              />
              <CardContent sx={{ p: c(1, 0.75) }}>
                {loadingColumns ? (
                  <CircularProgress size={16} />
                ) : (
                    <PickerField
                      label="Group By"
                      options={dimensionOptions}
                      selected={groupby}
                      onChange={v => setGroupby(v)}
                      placeholder="Add dimensions..."
                      hideHeader
                      hideGroups
                    />
                )}
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, p: c(1.5, 0.75), minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {preview}
      </Box>
    </Box>
  );
}
