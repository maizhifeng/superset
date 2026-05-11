import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metricsAPI, datasetsAPI, dbAPI } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/Toast';
import {
  Box,
  Typography,
  Drawer,
  IconButton,
  Card,
  CardHeader,
  CardContent,
  Paper,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
const isNumeric = (type) => numericTypes.includes(type?.toLowerCase());

const BASE_Z_INDEX = 1300;

function ConfigSection({ title, icon, subtitle, action, children }) {
  return (
    <Card
      elevation={1}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <CardHeader
        sx={{
          px: 2,
          py: 1.5,
          backgroundColor: 'grey.50',
          borderBottom: children ? '1px solid' : 'none',
          borderColor: 'divider',
          '& .MuiCardHeader-content': {
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          },
          '& .MuiCardHeader-action': {
            mr: 0,
          },
        }}
        avatar={<Icon name={icon} size={16} sx={{ color: 'primary.main' }} />}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        }
        action={action}
      />
      {children && <CardContent sx={{ p: 2, pt: 2 }}>{children}</CardContent>}
    </Card>
  );
}

export default function MetricBuilderModal({ isOpen, metric, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [datasetId, setDatasetId] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [metrics, setMetrics] = useState([{ func: 'SUM', field: '', alias: '', weightField: '' }]);
  const [numberFormat, setNumberFormat] = useState('float');
  const [previewSQL, setPreviewSQL] = useState('');
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [showSQLPreview, setShowSQLPreview] = useState(false);
  const isEditing = !!metric;

  // SQL 格式化函数
  const formatSQL = (sql) => {
    if (!sql) return '';
    return sql
      .replace(/\bSELECT\b/gi, '\nSELECT\n  ')
      .replace(/\bFROM\b/gi, '\nFROM\n  ')
      .replace(/\bWHERE\b/gi, '\nWHERE\n  ')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY\n  ')
      .replace(/\bORDER BY\b/gi, '\nORDER BY\n  ')
      .replace(/\bHAVING\b/gi, '\nHAVING\n  ')
      .replace(/,/g, ',\n  ')
      .trim();
  };

  // 检测是否有变更
  const hasChanges = useMemo(() => {
    if (metric) {
      const c = metric.config || {};
      return name !== (metric.name || '') ||
        description !== (metric.description || '') ||
        datasetId !== metric.dataset_id ||
        numberFormat !== (c.numberFormat || 'float') ||
        JSON.stringify(metrics) !== JSON.stringify(c.aggregations || [{ func: 'SUM', field: '', alias: '', weightField: '' }]);
    }
    return name !== '' || datasetId !== null || metrics.some(m => m.field);
  }, [name, description, datasetId, numberFormat, metrics, metric]);

  const { data: metricConfig } = useQuery({
    queryKey: ['metricConfig'],
    queryFn: metricsAPI.getConfig,
  });

  const { data: datasetsData } = useQuery({
    queryKey: ['datasets'],
    queryFn: datasetsAPI.list,
  });

  const baseTable = selectedDataset?.base_table || '';
  const baseSchema = selectedDataset?.config?.base_schema || (baseTable.includes('.') ? baseTable.split('.')[0] : '');
  const bareTable = baseTable.includes('.') ? baseTable.split('.').slice(1).join('.') : baseTable;

  const { data: columnsData } = useQuery({
    queryKey: ['tableColumns', baseSchema, bareTable],
    queryFn: () => dbAPI.getTableColumns(bareTable, baseSchema || 'public'),
    enabled: !!baseTable,
  });

  const tableColumns = columnsData?.data || [];
  const availableDatasets = datasetsData?.data || [];

  const availableFields = useMemo(() => {
    if (!selectedDataset) return [];
    const dsFields = selectedDataset.config?.fields;
    if (dsFields && dsFields.length > 0) {
      return dsFields.map(f => {
        const col = tableColumns.find(c => c.column_name === f.field);
        return {
          name: f.field,
          originalName: f.field,
          data_type: col?.data_type || 'unknown',
          isNumeric: col ? isNumeric(col.data_type) : false,
        };
      });
    }
    return tableColumns.map(c => ({
      name: c.column_name,
      originalName: c.column_name,
      data_type: c.data_type,
      isNumeric: isNumeric(c.data_type),
    }));
  }, [selectedDataset, tableColumns]);

  const numericFields = availableFields.filter(f => f.isNumeric);

  useEffect(() => {
    if (metric) {
      const c = metric.config || {};
      setName(metric.name || '');
      setDescription(metric.description || '');
      setDatasetId(metric.dataset_id || null);
      if (metric.dataset_id && datasetsData?.data) {
        const ds = datasetsData.data.find(d => d.id === metric.dataset_id);
        setSelectedDataset(ds || null);
      } else {
        setSelectedDataset(null);
      }
      setMetrics(c.aggregations || [{ func: 'SUM', field: '', alias: '', weightField: '' }]);
      setNumberFormat(c.numberFormat || 'float');
    } else {
      setName('');
      setDescription('');
      setDatasetId(null);
      setSelectedDataset(null);
      setMetrics([{ func: 'SUM', field: '', alias: '', weightField: '' }]);
      setNumberFormat('float');
      setPreviewSQL('');
    }
  }, [metric, datasetsData?.data]);

  // Reset metrics when user explicitly switches dataset (not on initial edit load)
  const prevDatasetRef = useRef(null);
  useEffect(() => {
    if (prevDatasetRef.current === null) {
      prevDatasetRef.current = datasetId;
      return;
    }
    if (prevDatasetRef.current === datasetId) return;
    prevDatasetRef.current = datasetId;
    setMetrics([{ func: 'SUM', field: '', alias: '', weightField: '' }]);
    setPreviewSQL('');
  }, [datasetId]);

  const buildConfig = () => ({
    aggregations: metrics.filter(m => m.field),
    ...(numberFormat !== 'float' ? { numberFormat } : {}),
  });

  const previewMutation = useMutation({
    mutationFn: (payload) => metricsAPI.previewSQL(payload),
    onSuccess: (data) => setPreviewSQL(data.displaySQL || data.sql),  // 使用 displaySQL（已替换参数值）
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return metricsAPI.update(metric.id, data);
      }
      // 新建时：如果配置了多个指标，批量创建多个独立指标
      const validMetrics = metrics.filter(m => m.field);
      if (validMetrics.length > 1) {
        // 为每个指标配置创建独立指标，名称自增：xxx_1, xxx_2, xxx_3
        const results = await Promise.all(
          validMetrics.map((m, idx) => {
            return metricsAPI.create({
              name: `${name}_${idx + 1}`,
              description: description || '',
              dataset_id: datasetId,
              config: { aggregations: [m] },
            });
          })
        );
        return { created: results.length, results };
      }
      // 单个指标正常创建
      return metricsAPI.create(data);
    },
    onSuccess: (data) => {
      setSaveError(null);
      queryClient.invalidateQueries(['metrics']);
      if (isEditing && metric?.id) {
        queryClient.invalidateQueries(['metric', metric.id]);
      }
      // Metric changes affect all dashboards — invalidate broadly
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['metricData'] });
      // 延迟显示 Toast，等待 Drawer 关闭动画完成
      setTimeout(() => {
        if (data?.created) {
          toast.showSuccess(`成功创建 ${data.created} 个指标`);
        } else {
          toast.showSuccess(isEditing ? '指标已更新' : '指标创建成功');
        }
      }, 300);
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      setSaveError(error.message || '保存失败');
    },
  });

  const handlePreview = () => {
    if (!selectedDataset) return;
    setShowSQLPreview(true);
    previewMutation.mutate({
      dataset_id: datasetId,
      ...buildConfig(),
    });
  };

  const handleSave = () => {
    if (!name || !datasetId) return;
    saveMutation.mutate({
      name,
      description,
      dataset_id: datasetId,
      config: buildConfig(),
    });
  };

  const handleCopySQL = () => {
    navigator.clipboard?.writeText(previewSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDatasetSelect = (dataset) => {
    setDatasetId(dataset.id);
    setSelectedDataset(dataset);
  };

  const aggregations = metricConfig?.aggregations || [];

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

  return (
    <>
<Drawer
      anchor="right"
      open={isReady}
      onClose={() => { document.activeElement?.blur(); onClose?.(); }}
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
      {/* Header - GTM style: 名称输入框作为标题 */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="输入指标名称..."
          autoFocus={!isEditing}
          sx={{
            flex: 1,
            fontSize: '1.1rem',
            fontWeight: 600,
            '& input': {
              fontWeight: 600,
            },
          }}
        />
        <Tooltip title="关闭">
          <IconButton onClick={() => { document.activeElement?.blur(); onClose?.(); }} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content - GTM 风格分区卡片 */}
      <Box sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, bgcolor: 'grey.100' }}>
        {/* 数据集配置 Section */}
        <ConfigSection title="数据集配置" icon="database">
          <Box
            onClick={() => !selectedDataset && setShowDatasetPicker(true)}
            sx={{
              border: '1px solid',
              borderColor: selectedDataset ? 'primary.200' : 'divider',
              borderRadius: 1.5,
              p: 2,
              bgcolor: selectedDataset ? 'primary.50' : 'grey.50',
              cursor: selectedDataset ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              minHeight: 60,
              transition: 'all 150ms',
              '&:hover': selectedDataset ? {} : {
                borderColor: 'primary.300',
                bgcolor: 'grey.100',
              },
            }}
          >
            {selectedDataset ? (
              <>
                <Icon name="database" size={20} sx={{ color: 'primary.main' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{selectedDataset.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{selectedDataset.base_table}</Typography>
                </Box>
                <Tooltip title="清除数据集">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setDatasetId(null); setSelectedDataset(null); }}
                    sx={{ color: 'text.secondary' }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <>
                <Icon name="plus" size={20} sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  点击选择数据集或源表格...
                </Typography>
              </>
        )}
        </Box>
      </ConfigSection>

      {/* 聚合函数配置 Section - 头部显示已配置数量 */}
      {selectedDataset && (
        <ConfigSection
          title="聚合函数"
          icon="barChart3"
          subtitle={metrics.filter(m => m.field).length === 0 ? '未配置' : `${metrics.filter(m => m.field).length} 个指标`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMetrics([...metrics, { func: 'SUM', field: '', alias: '', weightField: '' }])}
              sx={{ color: 'primary.main', borderColor: 'primary.main' }}
            >
              <AddIcon fontSize="small" sx={{ mr: 0.5 }} />
              添加
            </Button>
          }
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {metrics.map((item, i) => (
              <Paper
                key={i}
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'grey.200',
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 聚合函数 */}
                  <Box sx={{ minWidth: 100 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>聚合</Typography>
                    <select
                      value={item.func}
                      onChange={e => {
                        const newItems = [...metrics];
                        newItems[i] = { ...newItems[i], func: e.target.value, weightField: e.target.value !== 'AVG' ? '' : newItems[i].weightField };
                        setMetrics(newItems);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        fontSize: '0.85rem',
                        bgcolor: 'white',
                      }}
                    >
                      {aggregations.map(a => (<option key={a.value} value={a.value}>{a.label}</option>))}
                    </select>
                  </Box>

                  {/* 字段 */}
                  <Box sx={{ minWidth: 140, flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>字段</Typography>
                    <select
                      value={item.field}
                      onChange={e => {
                        const value = e.target.value;
                        if (value === '*' && numericFields.length > 0) {
                          const batchMetrics = numericFields.map(f => ({
                            func: item.func,
                            field: f.originalName,
                            alias: `${item.func.toLowerCase()}_${f.name}`,
                            weightField: item.func === 'AVG' ? '' : undefined,
                          }));
                          const newItems = [...metrics.slice(0, i), ...batchMetrics, ...metrics.slice(i + 1)];
                          setMetrics(newItems.length > 0 ? newItems : [{ func: 'SUM', field: '', alias: '', weightField: '' }]);
                        } else {
                          const newItems = [...metrics];
                          newItems[i] = { ...newItems[i], field: value };
                          setMetrics(newItems);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        fontSize: '0.85rem',
                        bgcolor: 'white',
                      }}
                    >
                      <option value="">选择字段</option>
                      <option value="*">批量生成 (所有数值字段)</option>
                      {numericFields.map(f => (<option key={f.originalName} value={f.originalName}>{f.name}</option>))}
                    </select>
                  </Box>

                  {/* 别名 */}
                  <Box sx={{ minWidth: 100 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>别名</Typography>
                    <Input
                      type="text"
                      value={item.alias}
                      onChange={e => {
                        const newItems = [...metrics];
                        newItems[i] = { ...newItems[i], alias: e.target.value };
                        setMetrics(newItems);
                      }}
                      placeholder="可选"
                      sx={{ fontSize: '0.85rem' }}
                    />
                  </Box>

                  {/* 删除按钮 */}
                  <Tooltip title="删除指标">
                    <IconButton
                      size="small"
                      onClick={() => setMetrics(metrics.filter((_, idx) => idx !== i))}
                      sx={{
                        mt: 1.5,
                        color: 'error.main',
                        '&:hover': { bgcolor: 'error.50' },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* AVG 权重字段 */}
                {item.func === 'AVG' && (
                  <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">权重字段:</Typography>
                    <select
                      value={item.weightField || ''}
                      onChange={e => {
                        const newItems = [...metrics];
                        newItems[i] = { ...newItems[i], weightField: e.target.value };
                        setMetrics(newItems);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        fontSize: '0.85rem',
                        bgcolor: 'white',
                      }}
                    >
                      <option value="">无 (简单平均)</option>
                      {availableFields.map(f => (<option key={f.originalName} value={f.originalName}>{f.name}</option>))}
                    </select>
                  </Box>
                )}
              </Paper>
            ))}
          </Box>
        </ConfigSection>
      )}

      {/* 数值格式配置 Section */}
      {selectedDataset && (
        <ConfigSection title="数值格式" icon="hash">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">显示格式</Typography>
            <select
              value={numberFormat}
              onChange={e => setNumberFormat(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: '0.85rem',
                bgcolor: 'white',
              }}
            >
              <option value="float">浮点数（自动精度）</option>
              <option value="integer">整数</option>
              <option value="percentage">百分比</option>
            </select>
          </Box>
        </ConfigSection>
      )}

      </Box>

      {/* Error */}
      {saveError && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'error.50', color: 'error.main', fontSize: '0.875rem' }}>
          {saveError}
        </Box>
      )}

      {/* Footer */}
      <Box sx={{ px: 3, py: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="outline"
          onClick={handlePreview}
          disabled={!selectedDataset}
        >
          <Icon name="code" size={14} sx={{ mr: 0.5 }} />
          预览 SQL
        </Button>
        <Button
          onClick={handleSave}
          disabled={!name || !datasetId || saveMutation.isPending}
          sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {saveMutation.isPending ? '保存中...' : (isEditing ? '保存' : '创建')}
        </Button>
      </Box>
    </Drawer>

    {/* 数据集选择器 */}
      <Drawer
        anchor="right"
        open={showDatasetPicker}
        onClose={() => { document.activeElement?.blur(); setShowDatasetPicker(false); }}
        sx={{ zIndex: BASE_Z_INDEX + 2 }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
            },
          },
          modal: {
            keepMounted: true,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择数据集</Typography>
        </Box>
        <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
          {availableDatasets.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Icon name="database" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2">暂无数据集</Typography>
              <Typography variant="caption">请先创建数据集</Typography>
            </Box>
          ) : (
            availableDatasets.map(ds => (
              <Box
                key={ds.id}
                component="button"
                type="button"
                onClick={() => { handleDatasetSelect(ds); setShowDatasetPicker(false); }}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  border: 'none',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  color: 'inherit',
                  textAlign: 'left',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:last-of-type': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ width: 36, height: 36, bgcolor: 'primary.light', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="database" size={16} sx={{ color: 'primary.main' }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{ds.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{ds.base_table}</Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Drawer>

{/* SQL 预览 */}
      <Drawer
        anchor="right"
        open={showSQLPreview}
        onClose={() => { document.activeElement?.blur(); setShowSQLPreview(false); }}
        sx={{ zIndex: BASE_Z_INDEX + 4 }}
        slotProps={{
          paper: {
            sx: {
              width: 400,
            },
          },
          modal: {
            keepMounted: true,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Icon name="code" size={16} sx={{ color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>SQL 预览</Typography>
          </Box>
          <Tooltip title="关闭">
            <IconButton size="small" onClick={() => setShowSQLPreview(false)} sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
          {previewMutation.isPending ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Icon name="spinner" size={24} sx={{ animation: 'spin 1s linear infinite', color: 'primary.main' }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>生成 SQL...</Typography>
            </Box>
          ) : previewSQL ? (
            <>
              {/* 格式化的 SQL 显示 */}
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'grey.900',
                  color: 'grey.100',
                  borderRadius: 1.5,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  overflowX: 'auto',
                }}
              >
                {formatSQL(previewSQL)}
              </Box>

              {/* 简短摘要 */}
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  数据源: {selectedDataset?.name} ({selectedDataset?.base_table})
                </Typography>
              </Box>
            </>
          ) : (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Icon name="code" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2">点击"预览 SQL"生成查询语句</Typography>
            </Box>
          )}
        </Box>

        {/* 底部操作 */}
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="outline" size="sm" onClick={() => setShowSQLPreview(false)}>
            关闭
          </Button>
          {previewSQL && (
            <Button size="sm" onClick={handleCopySQL}>
              <Icon name={copied ? 'check' : 'copy'} size={14} sx={{ mr: 0.5 }} />
              {copied ? '已复制' : '复制 SQL'}
            </Button>
          )}
        </Box>
      </Drawer>
    </>
  );
}