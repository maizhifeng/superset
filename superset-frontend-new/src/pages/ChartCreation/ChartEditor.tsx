import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import SaveIcon from '@mui/icons-material/Save';
import type { EChartsOption } from 'echarts';
import { buildEChartsOption, ensureChartType } from '@/utils/echarts';
import { buildQueryObject } from '@/utils/query/extractQueryFields';
import api from '@/api';
import { parseErrorMessage } from '@/utils/parseErrorMessage';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import { useNotificationStore } from '@/store/notificationStore';
import PageSpeedDial from '@/components/PageSpeedDial';
import ChartPreview from './ChartPreview';
import ChartEditorForm from './ChartEditorForm';
import ExploreViewContainer from '@/explore/components/ExploreViewContainer';
import type { Dataset } from '@/types/api';

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

interface ChartInitialData {
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  form_data?: string | Record<string, unknown> | null;
  params?: string | Record<string, unknown> | null;
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
  const [, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);

  const isEditing = Boolean(sliceId || initialData?.datasource_id);
  const notify = useNotificationStore(s => s.notify);
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
    api.get<{ result: Dataset[] }>('/dataset/?q=(page_size:200,page:0)')
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
    if (initialData?.form_data || initialData?.params) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ''));
      const raw = initialData.form_data || initialData.params;
      restoreFormData(raw);
      setLoadingChart(false);
      return;
    }
    if (initialData) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ''));
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
        setError(parseErrorMessage(err, 'Failed to load chart'));
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
  const hasValidType = Boolean(resolvedType && resolvedType !== 'auto');

  const [chartLibReady, setChartLibReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChartLibReady(false);
    ensureChartType(resolvedType).then(() => {
      if (!cancelled) setChartLibReady(true);
    });
    return () => { cancelled = true; };
  }, [resolvedType]);

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

    const query = buildQueryObject(
      { metrics: buildMetricsPayload(previewParams.metrics), groupby: previewParams.groupby, viz_type: previewParams.viz_type },
      previewParams.viz_type,
    );
    api.post('/chart/data', {
      datasource: { id: previewParams.datasource_id, type: 'table' },
      queries: [query],
      form_data: { viz_type: previewParams.viz_type, metrics: previewParams.metrics, groupby: previewParams.groupby },
    }, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const result = res.data?.result;
        const rowData = Array.isArray(result) ? (result[0] || {}) : (result || {});
        setChartData(rowData);
      })
      .catch(() => {
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
    return buildEChartsOption(resolvedType, chartData) as EChartsOption | null;
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
    if (!datasourceId || !hasValidType) {
      notify({ severity: 'warning', message: 'Please select a dataset and ensure a chart type is available before saving' });
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const selectedDataset = datasets.find(d => d.id === Number(datasourceId));
      const effectiveType = resolvedType === 'auto' ? 'line' : resolvedType;
      const formData = {
        viz_type: effectiveType,
        datasource: `${datasourceId}__table`,
        metrics: buildMetricsPayload(metrics),
        groupby,
      };
      const queryContext = buildQueryObject(formData, effectiveType);
      const body = {
        slice_name: sliceName || selectedDataset?.table_name || 'Untitled',
        viz_type: effectiveType,
        datasource_id: Number(datasourceId),
        datasource_type: 'table',
        params: JSON.stringify(formData),
        query_context: JSON.stringify(queryContext),
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
        notify({ severity: 'success', message: 'Chart saved' });
        onChartSaved(savedId);
      } else {
        notify({ severity: 'success', message: 'Chart saved' });
        navigate('/chart/list');
      }
    } catch (err: unknown) {
      const errMsg = parseErrorMessage(err, 'Failed to save chart');
      setError(errMsg);
      notify({ severity: 'error', message: errMsg });
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
        render: null,
      },
    ]);
    return () => unregisterTools('chart_editor');
  }, [registerTools, unregisterTools, handleSubmit, isEditing]);

  const handleRunQuery = useCallback(() => {
    setLoadingData(true);
    const query = buildQueryObject(
      { metrics: buildMetricsPayload(metrics), groupby, viz_type: resolvedType === 'auto' ? 'line' : resolvedType },
      resolvedType === 'auto' ? 'line' : resolvedType,
    );
    api.post('/chart/data', {
      datasource: { id: Number(datasourceId), type: 'table' },
      queries: [query],
      form_data: { viz_type: resolvedType, metrics, groupby },
    })
      .then(res => {
        const result = res.data?.result;
        const rowData = Array.isArray(result) ? (result[0] || {}) : (result || {});
        setChartData(rowData);
      })
      .catch(() => setChartData({}))
      .finally(() => setLoadingData(false));
  }, [datasourceId, resolvedType, metrics, groupby, metricNames]);

  const handleChartTypeChange = (val: string) => {
    setVizType(val);
    setUserChangedType(val !== 'auto');
  };

  if (loadingChart) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  const c = (full: number | string, comp: number | string) => compact ? comp : full;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ExploreViewContainer
        onRunQuery={handleRunQuery}
        onSaveChart={handleSubmit}
      />
      {error && (
        <Alert severity="error" sx={{ mx: c(2, 1.5), mt: c(2, 1.5), flexShrink: 0 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ChartEditorForm
        sliceName={sliceName}
        datasets={datasets}
        datasourceId={datasourceId}
        metrics={metrics}
        groupby={groupby}
        metricsOptions={metricsOptions}
        dimensionOptions={dimensionOptions}
        loadingDatasets={loadingDatasets}
        loadingColumns={loadingColumns}
        compact={compact}
        onSliceNameChange={setSliceName}
        onDatasourceChange={(id) => { setDatasourceId(id); setMetrics([]); setGroupby([]); setUserChangedType(false); }}
        onMetricsChange={handleMetricsChange}
        onGroupbyChange={setGroupby}
      />

      <Box sx={{ flex: 1, p: c(1.5, 0.75), minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChartPreview
          datasourceId={datasourceId}
          vizType={vizType}
          resolvedType={resolvedType}
          hasValidType={hasValidType}
          metrics={metrics}
          chartData={chartData}
          loadingData={loadingData}
          suggestedVizType={suggested?.vizType}
          disabledReasons={disabledReasons}
          onChartTypeChange={handleChartTypeChange}
          chartLibReady={chartLibReady}
          option={option}
          bigNumberValue={bigNumberValue}
        />
      </Box>
      {!compact && <PageSpeedDial pageKeys="chart_editor" />}
    </Box>
  );
}
