import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metricsAPI, dashboardsAPI, dbAPI, datasetsAPI } from '../../api';
import { useDBStore } from '../../store';
import { Button, Input } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Box, Typography, Drawer, IconButton, Chip, FormControlLabel, Switch, Tooltip, ToggleButtonGroup, ToggleButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import ConfigSection from './ConfigSection';
import TablePicker from './TablePicker';
import MetricPicker from './MetricPicker';
import DimensionPicker from './DimensionPicker';
import { useWidgetForm } from './useWidgetForm';

const BASE_Z_INDEX = 1300;
const TOAST_DELAY = 300;

export default function AddWidgetModal({ dashboardId, widget, isOpen, onClose, onAdd, onDelete, onUnsavedChanges, restoredFormData }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tables, setTables } = useDBStore();
  const isEditing = !!widget;

  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showMetricPicker, setShowMetricPicker] = useState(false);
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        document.activeElement?.blur();
        setIsReady(true);
      });
    } else {
      setIsReady(false);
    }
  }, [isOpen]);

  // Queries - tables
  const { data: tablesData } = useQuery({
    queryKey: ['tables'],
    queryFn: dbAPI.getTables,
    enabled: tables.length === 0,
  });

  // Queries - metrics
  const { data: metricsData } = useQuery({
    queryKey: ['metrics'],
    queryFn: metricsAPI.list,
  });

  // Queries - datasets
  const { data: datasetsData } = useQuery({
    queryKey: ['datasets'],
    queryFn: datasetsAPI.list,
  });

  // Initialize tables from query
  useEffect(() => {
    if (tablesData?.data && tables.length === 0) {
      setTables(tablesData.data);
    }
  }, [tablesData, tables.length, setTables]);

  // Derived data before form hook
  const availableTables = tables.length > 0 ? tables : (tablesData?.data || []);
  const allMetrics = metricsData?.data || [];

  // Build merged data sources (tables + datasets)
  const datasets = datasetsData?.data || [];
  const dataSources = useMemo(() => {
    const sources = [];
    for (const t of availableTables) {
      sources.push({ name: t.table_name, type: 'table', baseTable: t.table_name });
    }
    for (const d of datasets) {
      if (!sources.some(s => s.name === d.name)) {
        sources.push({ name: d.name, type: 'dataset', baseTable: d.base_table });
      }
    }
    return sources;
  }, [availableTables, datasets]);

  // Group metrics by both config.table (raw table metrics) and dataset_name (dataset metrics)
  const groupedMetrics = useMemo(() => {
    const groups = {};
    allMetrics.forEach(m => {
      if (m.config?.table) {
        if (!groups[m.config.table]) groups[m.config.table] = [];
        groups[m.config.table].push(m);
      }
      if (m.dataset_name) {
        if (!groups[m.dataset_name]) groups[m.dataset_name] = [];
        groups[m.dataset_name].push(m);
      }
    });
    return groups;
  }, [allMetrics]);

  // Use the form hook - MUST call at top level
  const form = useWidgetForm({ widget, restoredFormData });

  // Resolve selected source: dataset → use its base_table, table → use name as-is
  const selectedSource = useMemo(() => {
    if (!form.selectedTable) return null;
    return dataSources.find(s => s.name === form.selectedTable) || null;
  }, [form.selectedTable, dataSources]);
  const baseTable = selectedSource?.baseTable || form.selectedTable || '';
  const colSchema = baseTable.includes('.') ? baseTable.split('.')[0] : '';
  const colTable = baseTable.includes('.') ? baseTable.split('.').slice(1).join('.') : baseTable;

  // Queries - columns (depends on resolved base table)
  const { data: columnsData } = useQuery({
    queryKey: ['tableColumns', colSchema, colTable],
    queryFn: () => dbAPI.getTableColumns(colTable, colSchema || 'public'),
    enabled: !!baseTable,
  });

  // Derived data after columns query
  const columns = columnsData?.data || [];
  const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
  const hasDimensionMeta = columns.some(c => c.is_dimension || c.is_date);
  const dimensionColumns = hasDimensionMeta
    ? columns.filter(c => c.is_dimension || c.is_date)
    : columns.filter(c => !numericTypes.includes(c.data_type?.toLowerCase()));
  const validDimensionNames = new Set(dimensionColumns.map(c => c.column_name));
  const metricsList = form.selectedTable ? (groupedMetrics[form.selectedTable] || []) : [];

  // Mutations
  const addMutation = useMutation({
    mutationFn: (data) => dashboardsAPI.addWidget(dashboardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard', dashboardId]);
      setTimeout(() => toast.showSuccess('图表已添加'), TOAST_DELAY);
      onAdd?.();
    },
    onError: (error) => {
      toast.showError(error.message || '添加图表失败');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => dashboardsAPI.updateWidget(widget.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard', dashboardId]);
      setTimeout(() => toast.showSuccess('图表已更新'), TOAST_DELAY);
      onAdd?.();
    },
    onError: (error) => {
      toast.showError(error.message || '更新图表失败');
    },
  });

  // Handlers
  const handleSubmit = () => {
    if (!form.title || form.metricIds.length === 0) {
      toast.showError('请填写标题并选择至少一个指标');
      return;
    }

    const datasetSource = selectedSource?.type === 'dataset' ? form.selectedTable : undefined;
    const data = form.buildSubmitData({ table: baseTable, datasetSource, ...(widget?.config ? { existingConfig: widget.config } : {}) });
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      addMutation.mutate(data);
    }
  };

  const handleClose = () => {
    document.activeElement?.blur();
    if (form.hasChanges && onUnsavedChanges) {
      onUnsavedChanges({ widget, formData: form.getFormData() });
    }
    onClose?.();
  };

  const pendingMutation = isEditing ? updateMutation : addMutation;

  return (
    <>
      {/* Main Drawer */}
<Drawer
        anchor="right"
        open={isReady}
        onClose={handleClose}
        sx={{ zIndex: BASE_Z_INDEX }}
        slotProps={{
          paper: {
            sx: {
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              width: 640,
            },
          },
          modal: {
            keepMounted: true,
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Input
            type="text"
            value={form.title}
            onChange={e => form.setTitle(e.target.value)}
            placeholder="输入图表名称..."
            autoFocus={!isEditing}
            sx={{ flex: 1, fontSize: '1.1rem', fontWeight: 600, '& input': { fontWeight: 600 } }}
          />
          <Tooltip title="关闭">
            <IconButton onClick={handleClose} size="small" sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Content */}
        <Box sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, bgcolor: 'grey.100' }}>
          {/* Data Source Section */}
          <ConfigSection title="数据源配置" icon="database">
            <Box
              onClick={() => !form.selectedTable && setShowTablePicker(true)}
              sx={{
                border: '1px solid',
                borderColor: form.selectedTable ? 'primary.200' : 'divider',
                borderRadius: 1.5,
                p: 2,
                bgcolor: form.selectedTable ? 'primary.50' : 'grey.50',
                cursor: form.selectedTable ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 60,
                transition: 'all 150ms',
                '&:hover': form.selectedTable ? {} : { borderColor: 'primary.300', bgcolor: 'grey.100' },
              }}
            >
              {form.selectedTable ? (
                <>
                  <Icon name={selectedSource?.type === 'dataset' ? 'layerGroup' : 'database'} size={20} sx={{ color: 'primary.main' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {selectedSource?.type === 'dataset' ? `${form.selectedTable}` : form.selectedTable}
                      {selectedSource?.type === 'dataset' && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({selectedSource.baseTable})
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{groupedMetrics[form.selectedTable]?.length || 0} 个指标可用</Typography>
                  </Box>
                  {!isEditing && (
                    <Tooltip title="清除数据源">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); form.setSelectedTable(''); form.setMetricIds([]); }} sx={{ color: 'text.secondary' }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </>
              ) : (
                <>
                  <Icon name="plus" size={20} sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">点击选择数据源表...</Typography>
                </>
              )}
            </Box>
          </ConfigSection>

          {/* Chart Type Section */}
          {form.selectedTable && (
            <ConfigSection title="图表类型" icon="barChart3" subtitle={form.chartTypes.find(c => c.value === form.chartType)?.label}>
              <select value={form.chartType} onChange={e => form.setChartType(e.target.value)} style={form.selectSx}>
                {form.chartTypes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </ConfigSection>
          )}

          {/* Metric Selection Section */}
          {form.selectedTable && (
            <ConfigSection
              title="指标选择"
              icon="metrics"
              subtitle={form.metricIds.length === 0 ? '未选择' : `${form.metricIds.length} 个`}
              action={<Button variant="outline" size="sm" onClick={() => setShowMetricPicker(true)} sx={{ color: 'primary.main', borderColor: 'primary.main' }}><AddIcon fontSize="small" sx={{ mr: 0.5 }} />选择</Button>}
            >
              {form.metricIds.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {form.metricIds.map(id => {
                    const m = allMetrics.find(m => String(m.id) === id);
                    return (
                      <Chip
                        key={id}
                        label={m?.name || `指标 #${id}`}
                        size="small"
                        color={m ? 'primary' : 'warning'}
                        variant={m ? 'outlined' : 'filled'}
                        onDelete={() => form.handleMetricToggle(id)}
                        sx={{
                          fontWeight: 500,
                          '& .MuiChip-deleteIcon': { color: m ? 'primary.main' : 'warning.main', '&:hover': { color: 'error.main' } },
                        }}
                      />
                    );
                  })}
                </Box>
              )}
            </ConfigSection>
          )}

          {/* Dimensions Section */}
          {form.hasMetrics && (
            <ConfigSection
              title="分组维度"
              icon="layerGroup"
              subtitle={form.dimensions.filter(Boolean).length === 0 ? '未配置' : `${form.dimensions.filter(Boolean).length} 个`}
              action={<Button variant="outline" size="sm" onClick={() => setShowDimensionPicker(true)} sx={{ color: 'primary.main', borderColor: 'primary.main' }}><AddIcon fontSize="small" sx={{ mr: 0.5 }} />选择</Button>}
            >
              {form.dimensions.filter(Boolean).length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {form.dimensions.filter(Boolean).map(d => {
                    const isValid = columns.length === 0 || validDimensionNames.has(d);
                    return (
                      <Chip
                        key={d}
                        label={isValid ? d : `${d}（表中无此列）`}
                        size="small"
                        color={isValid ? 'primary' : 'warning'}
                        variant={isValid ? 'outlined' : 'filled'}
                        onDelete={() => form.setDimensions(form.dimensions.filter(dim => dim !== d))}
                        sx={{
                          fontWeight: 500,
                          '& .MuiChip-deleteIcon': { color: isValid ? 'primary.main' : 'warning.main', '&:hover': { color: 'error.main' } },
                        }}
                      />
                    );
                  })}
                </Box>
              )}
            </ConfigSection>
          )}

          {/* Filters Section */}
          {form.hasMetrics && (
            <ConfigSection
              title="筛选条件"
              icon="filter"
              subtitle={form.filters.length === 0 ? '无筛选条件' : `${form.filters.length} 条`}
              action={<Button variant="outline" size="sm" onClick={form.addFilter} sx={{ color: 'primary.main', borderColor: 'primary.main' }}><AddIcon fontSize="small" sx={{ mr: 0.5 }} />添加</Button>}
            >
              {form.filters.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}>
                  {form.filters.map((f, i) => (
                    <Box key={i}>
                      {i > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pl: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>与下个条件关系</Typography>
                          <ToggleButtonGroup
                            size="small"
                            value={f.logicalOperator || 'OR'}
                            exclusive
                            onChange={(_, v) => { if (v) form.updateFilter(i, 'logicalOperator', v); }}
                            sx={{ height: 24 }}
                          >
                            <ToggleButton value="OR" sx={{ fontSize: '0.6875rem', px: 1, py: 0, minHeight: 24 }}>OR</ToggleButton>
                            <ToggleButton value="AND" sx={{ fontSize: '0.6875rem', px: 1, py: 0, minHeight: 24 }}>AND</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <select value={f.field || ''} onChange={e => form.updateFilter(i, 'field', e.target.value)} style={{ width: 140, ...form.selectSx }}>
                          <option value="">选择字段</option>
                          {columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                        </select>
                        <select value={f.operator || '='} onChange={e => form.updateFilter(i, 'operator', e.target.value)} style={{ width: 100, ...form.selectSx }}>
                          {form.operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        <Input type="text" value={f.value || ''} onChange={e => form.updateFilter(i, 'value', e.target.value)} placeholder="值" sx={{ flex: 1, minWidth: 80 }} />
                        <Tooltip title="删除筛选">
                          <IconButton size="small" onClick={() => form.removeFilter(i)} sx={{ color: 'error.main' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
              <Box sx={{ pt: form.filters.length > 0 ? 2 : 0, borderTop: form.filters.length > 0 ? '1px solid' : 'none', borderColor: 'divider' }}>
                <FormControlLabel
                  control={<Switch size="small" checked={form.ignoreGlobalFilters} onChange={e => form.setIgnoreGlobalFilters(e.target.checked)} />}
                  label={<Typography variant="caption" sx={{ color: form.ignoreGlobalFilters ? 'warning.main' : 'text.secondary' }}>忽略全局日期筛选</Typography>}
                  sx={{ mr: 0 }}
                />
              </Box>
            </ConfigSection>
          )}

          {/* Order By Section */}
          {form.hasMetrics && (
            <ConfigSection
              title="排序条件"
              icon="sort"
              subtitle={form.orderBy.length === 0 ? '无排序条件' : `${form.orderBy.length} 条`}
              action={<Button variant="outline" size="sm" onClick={form.addOrderBy} sx={{ color: 'primary.main', borderColor: 'primary.main' }}><AddIcon fontSize="small" sx={{ mr: 0.5 }} />添加</Button>}
            >
              {form.orderBy.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {form.orderBy.map((o, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <select value={o.field || ''} onChange={e => form.updateOrderBy(i, 'field', e.target.value)} style={{ width: 140, ...form.selectSx }}>
                        <option value="">选择字段</option>
                        {columns.map(c => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
                      </select>
                      <select value={o.direction || 'DESC'} onChange={e => form.updateOrderBy(i, 'direction', e.target.value)} style={{ width: 140, ...form.selectSx }}>
                        <option value="ASC">ASC 升序</option>
                        <option value="DESC">DESC 降序</option>
                      </select>
                      <Tooltip title="删除排序">
                        <IconButton size="small" onClick={() => form.removeOrderBy(i)} sx={{ color: 'error.main' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              )}
            </ConfigSection>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ px: 3, py: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          {isEditing && (
            <Button variant="outline" onClick={() => setShowDeleteConfirm(true)} sx={{ mr: 'auto', color: 'error.main' }}>
              <Icon name="trash" size={16} />删除
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!form.title || form.metricIds.length === 0 || pendingMutation.isPending} sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}>
            {pendingMutation.isPending ? '保存中...' : (isEditing ? '保存更改' : '添加图表')}
          </Button>
        </Box>
      </Drawer>

      {/* Pickers */}
      <TablePicker
        open={showTablePicker}
        tables={dataSources}
        groupedMetrics={groupedMetrics}
        onSelect={(name) => {
          form.setSelectedTable(name);
          form.setMetricIds([]);
          setShowTablePicker(false);
        }}
        onClose={() => { document.activeElement?.blur(); setShowTablePicker(false); }}
        zIndex={BASE_Z_INDEX + 2}
      />

      <MetricPicker
        open={showMetricPicker}
        metrics={metricsList}
        selectedIds={form.metricIds}
        onToggle={form.handleMetricToggle}
        onClose={() => { document.activeElement?.blur(); setShowMetricPicker(false); }}
        zIndex={BASE_Z_INDEX + 4}
      />

      <DimensionPicker
        open={showDimensionPicker}
        columns={dimensionColumns}
        selectedDimensions={form.dimensions}
        onToggle={form.handleDimensionToggle}
        onClose={() => { document.activeElement?.blur(); setShowDimensionPicker(false); }}
        zIndex={BASE_Z_INDEX + 6}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="移至操作记录"
        message={`"${widget?.title || '未命名'}" 将移至操作记录，可随时恢复。`}
        confirmText="移至操作记录"
        cancelText="取消"
        isDanger={false}
        onConfirm={() => { setShowDeleteConfirm(false); onDelete?.(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}