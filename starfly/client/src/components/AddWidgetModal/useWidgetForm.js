import { useState, useEffect, useMemo, useCallback } from 'react';

// Constants
const chartTypes = [
  { value: 'auto', label: 'Auto', icon: 'sparkles' },
  { value: 'number', label: 'Number', icon: 'numberCard' },
  { value: 'line', label: 'Line', icon: 'lineChart' },
  { value: 'bar', label: 'Bar', icon: 'barChart3' },
  { value: 'area', label: 'Area', icon: 'areaChart' },
  { value: 'pie', label: 'Pie', icon: 'pieChart' },
  { value: 'table', label: 'Table', icon: 'table' },
];

const operators = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: 'LIKE', label: 'LIKE' },
];

const selectSx = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: '0.85rem',
  backgroundColor: 'white',
};

/**
 * useWidgetForm - Custom hook for managing widget form state
 * Handles initialization, validation, and form operations
 * Note: columns are handled in the parent component via query
 */
export function useWidgetForm({ widget, restoredFormData }) {
  // Form state
  const [title, setTitle] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [chartType, setChartType] = useState('auto');
  const [metricIds, setMetricIds] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [filters, setFilters] = useState([]);
  const [orderBy, setOrderBy] = useState([]);
  const [ignoreGlobalFilters, setIgnoreGlobalFilters] = useState(false);

  // Initialize from widget or restored draft
  useEffect(() => {
    if (widget) {
      setTitle(widget.title || '');
      let table = widget.config?.dataset_source || widget.config?.table || '';
      if (!table && (widget.metric_ids?.length || widget.metricIds?.length)) {
        table = widget.dataset_name || '';
      }
      setSelectedTable(table);
      setChartType(widget.config?.chartType || 'auto');
      setMetricIds(widget.metric_ids?.map(String) || widget.metricIds?.map(String) || []);
      setDimensions(widget.config?.dimensions || []);
      setFilters(widget.config?.filters || []);
      setOrderBy(widget.config?.orderBy || []);
      setIgnoreGlobalFilters(widget.config?.ignoreGlobalFilters || false);
    } else if (restoredFormData) {
      setTitle(restoredFormData.title || '');
      setSelectedTable(restoredFormData.selectedTable || '');
      setChartType(restoredFormData.chartType || 'auto');
      setMetricIds(restoredFormData.metricIds || []);
      setDimensions(restoredFormData.dimensions || []);
      setFilters(restoredFormData.filters || []);
      setOrderBy(restoredFormData.orderBy || []);
    } else {
      resetForm();
    }
  }, [widget, restoredFormData]);

  // Reset form
  const resetForm = useCallback(() => {
    setTitle('');
    setSelectedTable('');
    setChartType('auto');
    setMetricIds([]);
    setDimensions([]);
    setFilters([]);
    setOrderBy([]);
    setIgnoreGlobalFilters(false);
  }, []);

  // Has changes detection
  const hasChanges = useMemo(() => {
    if (widget) {
      return title !== (widget.title || '') ||
        selectedTable !== (widget.config?.table || '') ||
        chartType !== (widget.config?.chartType || 'auto') ||
        JSON.stringify(metricIds) !== JSON.stringify(widget.metric_ids?.map(String) || widget.metricIds?.map(String) || []) ||
        JSON.stringify(dimensions) !== JSON.stringify(widget.config?.dimensions || []) ||
        JSON.stringify(filters) !== JSON.stringify(widget.config?.filters || []);
    }
    return title !== '' || selectedTable !== '' || metricIds.length > 0;
  }, [title, selectedTable, chartType, metricIds, dimensions, filters, orderBy, widget]);

  // Filter/OrderBy helpers
  const addFilter = useCallback(() =>
    setFilters(prev => [...prev, { field: '', operator: '=', value: '' }]),
    []
  );

  const removeFilter = useCallback((index) =>
    setFilters(prev => prev.filter((_, i) => i !== index)),
    []
  );

  const updateFilter = useCallback((index, key, value) => {
    setFilters(prev => {
      const newFilters = [...prev];
      newFilters[index] = { ...newFilters[index], [key]: value };
      return newFilters;
    });
  }, []);

  const addOrderBy = useCallback(() =>
    setOrderBy(prev => [...prev, { field: '', direction: 'DESC' }]),
    []
  );

  const removeOrderBy = useCallback((index) =>
    setOrderBy(prev => prev.filter((_, i) => i !== index)),
    []
  );

  const updateOrderBy = useCallback((index, key, value) => {
    setOrderBy(prev => {
      const newOrderBy = [...prev];
      newOrderBy[index] = { ...newOrderBy[index], [key]: value };
      return newOrderBy;
    });
  }, []);

  // Metric toggle
  const handleMetricToggle = useCallback((id) => {
    const idStr = String(id);
    setMetricIds(prev =>
      prev.includes(idStr) ? prev.filter(m => m !== idStr) : [...prev, idStr]
    );
  }, []);

  // Dimension toggle
  const handleDimensionToggle = useCallback((dimension) => {
    setDimensions(prev => {
      if (prev.includes(dimension)) {
        return prev.filter(d => d !== dimension);
      }
      return [...prev, dimension];
    });
  }, []);

  // Build submit data
  const buildSubmitData = useCallback(({ table: tableOverride, datasetSource, existingConfig } = {}) => {
    const preservedFields = { ...(existingConfig || {}) };
    const formFields = [
      'table', 'chartType', 'dimensions', 'filters', 'orderBy', 'ignoreGlobalFilters',
      'dataset_source',
    ];
    formFields.forEach(f => delete preservedFields[f]);

    return {
      title,
      metricIds: metricIds.map(Number),
      config: {
        ...preservedFields,
        table: tableOverride || selectedTable,
        ...(datasetSource ? { dataset_source: datasetSource } : {}),
        chartType,
        dimensions: dimensions.filter(Boolean),
        filters: filters.filter(f => f.field && f.value),
        orderBy: orderBy.filter(o => o.field),
        ignoreGlobalFilters,
      },
    };
  }, [title, metricIds, selectedTable, chartType, dimensions, filters, orderBy, ignoreGlobalFilters]);

  // Get form data for draft save
  const getFormData = useCallback(() => ({
    title,
    metricIds,
    chartType,
    dimensions,
    filters,
    orderBy,
    selectedTable,
  }), [title, metricIds, chartType, dimensions, filters, orderBy, selectedTable]);

  return {
    // State
    title,
    setTitle,
    selectedTable,
    setSelectedTable,
    chartType,
    setChartType,
    metricIds,
    setMetricIds,
    dimensions,
    setDimensions,
    filters,
    setFilters,
    orderBy,
    setOrderBy,
    ignoreGlobalFilters,
    setIgnoreGlobalFilters,

    // Derived
    hasChanges,
    hasMetrics: metricIds.length > 0,

    // Helpers
    resetForm,
    addFilter,
    removeFilter,
    updateFilter,
    addOrderBy,
    removeOrderBy,
    updateOrderBy,
    handleMetricToggle,
    handleDimensionToggle,
    buildSubmitData,
    getFormData,

    // Constants
    chartTypes,
    operators,
    selectSx,
  };
}
