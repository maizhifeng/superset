import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
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
import PageHeader from '@/components/PageHeader';
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

function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const baseOption: Record<string, unknown> = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    animation: true, animationDuration: 300,
  };
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      ...baseOption, tooltip: { trigger: 'item' as const }, grid: undefined,
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
  const metricKey = valueKeys[0] || 'value';

  return {
    ...baseOption,
    xAxis: { type: 'category' as const, data: rows.slice(0, 50).map(r => String(r[categoryKey] ?? '')), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value' as const },
    series: [{
      type: echartsType, data: rows.slice(0, 50).map(r => Number(r[metricKey] || 0)),
      smooth: vizType === 'area', areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
      itemStyle: { color: '#20a7c9' },
    }],
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

interface ChartDetail {
  id: number;
  slice_name: string;
  viz_type: string;
  datasource_id: number;
  datasource_type: string;
  params: string;
}

export default function ChartCreation() {
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
  const [chartData, setChartData] = useState<Record<string, unknown> | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!sliceId) return;
    setLoadingChart(true);
    api.get<{ result: ChartDetail }>(`/chart/${sliceId}`)
      .then(res => {
        const chart = res.data.result;
        setSliceName(chart.slice_name);
        setVizType(chart.viz_type);
        setDatasourceId(String(chart.datasource_id));
        try {
          const parsed: Record<string, unknown> = JSON.parse(chart.params || '{}');
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
  }, [sliceId]);

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
  }, [previewParams, loadingColumns, metricNames]);

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
        params: {
          metrics: buildMetricsPayload(metrics),
          groupby,
          viz_type: vizType,
        },
      };

      if (isEditing) {
        await api.put(`/chart/${sliceId}`, body);
      } else {
        await api.post('/chart/', body);
      }

      navigate('/chart/list');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to save chart');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ p: 3, height: '100%' }}>
      <PageHeader title="Explore" subtitle={isEditing ? 'Edit chart' : 'Create a new chart'} />

      {loadingChart && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && !loadingChart && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loadingChart && (
      <Box sx={{ display: 'flex', gap: 3, height: 'calc(100% - 80px)' }}>
        <Paper sx={{ width: '35%', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <FormControl fullWidth>
            <InputLabel id="datasource-label">Datasource</InputLabel>
            <Select
              labelId="datasource-label"
              value={datasourceId}
              label="Datasource"
              onChange={e => setDatasourceId(e.target.value)}
              disabled={loadingDatasets}
            >
              {loadingDatasets ? (
                <MenuItem disabled>Loading...</MenuItem>
              ) : (
                datasets.map(ds => (
                  <MenuItem key={ds.id} value={ds.id}>
                    {ds.table_name}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="chart-type-label">Chart Type</InputLabel>
            <Select
              labelId="chart-type-label"
              value={vizType}
              label="Chart Type"
              onChange={e => setVizType(e.target.value)}
            >
              {CHART_TYPES.map(ct => (
                <MenuItem key={ct} value={ct}>
                  {ct.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Slice Name"
            value={sliceName}
            onChange={e => setSliceName(e.target.value)}
          />

          <Autocomplete
            multiple
            fullWidth
            size="small"
            loading={loadingColumns}
            options={metricsOptions}
            groupBy={o => o.group}
            value={metricsOptions.filter(o => metrics.includes(o.value))}
            onChange={(_, v) => setMetrics(v.map(o => o.value))}
            getOptionLabel={o => o.label}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            renderInput={params => <TextField {...params} label="Metrics" placeholder="Select metrics" />}
          />

          <Autocomplete
            multiple
            fullWidth
            size="small"
            loading={loadingColumns}
            options={fieldOptions}
            groupBy={o => o.group}
            value={fieldOptions.filter(o => groupby.includes(o.value))}
            onChange={(_, v) => setGroupby(v.map(o => o.value))}
            getOptionLabel={o => o.label}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            renderInput={params => <TextField {...params} label="Group By" placeholder="Select group-by columns" />}
          />

          <Button
            variant="contained"
            size="large"
            onClick={handleSubmit}
            disabled={creating || !datasourceId || !vizType}
            sx={{ mt: 1 }}
          >
            {creating ? <CircularProgress size={24} /> : isEditing ? 'Save Chart' : 'Create Chart'}
          </Button>
        </Paper>

        <Paper sx={{ width: '65%', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      </Box>
      )}
    </Box>
  );
}
