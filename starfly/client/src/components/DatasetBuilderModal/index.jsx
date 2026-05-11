import { useRef, useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasetsAPI, dbAPI } from '../../api';
import { useDBStore } from '../../store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/Toast';
import TruncationIndicator from '@/components/TruncationIndicator';
import ConfirmDialog, { useConfirmDialog } from '@/components/ConfirmDialog';
import { Box, Typography, Drawer, IconButton, Card, CardHeader, CardContent, Table, TableHead, TableBody, TableRow, TableContainer, TableCell, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
const isNumeric = (type) => numericTypes.includes(type?.toLowerCase());

const operators = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'IN', label: 'IN' },
  { value: 'IS NULL', label: 'IS NULL' },
  { value: 'IS NOT NULL', label: 'IS NOT NULL' },
];

const BASE_Z_INDEX = 1300;

// GTM 风格的 Section 卡片 - 使用 MUI Card，默认带阴影
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
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        }
        action={action}
      />
      {children && <CardContent sx={{ p: 2, pt: 2 }}>{children}</CardContent>}
    </Card>
  );
}

export default function DatasetBuilderModal({ isOpen, dataset, clearDraftSignal, onClearDraftHandled, onClose, onSuccess, restoredFormData }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tables, setTables, activeConnection } = useDBStore();
  const isEditing = !!dataset;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseTable, setBaseTable] = useState('');
  const [baseSchema, setBaseSchema] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [filters, setFilters] = useState([]);
  const [groupBy, setGroupBy] = useState([]);

  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  const [previewRows, setPreviewRows] = useState(null);
  const [rowCount, setRowCount] = useState(null);
  const [truncationInfo, setTruncationInfo] = useState(null);

  const draftRef = useRef(null);
  const initializedId = useRef(null);
  const confirmDialog = useConfirmDialog();

  const bareTableName = baseTable.includes('.') ? baseTable.split('.').slice(1).join('.') : baseTable;

  const { data: columnsData } = useQuery({
    queryKey: ['tableColumns', baseSchema, bareTableName],
    queryFn: () => dbAPI.getTableColumns(bareTableName, baseSchema || 'public'),
    enabled: !!baseTable && isOpen,
  });

  const { data: tablesData } = useQuery({
    queryKey: ['tables'],
    queryFn: dbAPI.getTables,
    enabled: tables.length === 0 && isOpen,
  });

  const columns = columnsData?.data || [];
  const availableTables = tables.length > 0 ? tables : (tablesData?.data || []);

  // 初始化状态
  useEffect(() => {
    if (tablesData?.data && tables.length === 0) {
      setTables(tablesData.data);
    }
  }, [tablesData, tables.length, setTables]);

  useEffect(() => {
    if (clearDraftSignal) {
      resetState();
      onClearDraftHandled?.();
    }
  }, [clearDraftSignal, onClearDraftHandled]);

  useEffect(() => {
    if (!isOpen) return;

    if (dataset) {
      if (initializedId.current !== dataset.id) {
        const cfg = dataset.config || {};
        setName(dataset.name);
        setDescription(dataset.description || '');
        setBaseTable(dataset.base_table);
        setBaseSchema(cfg.base_schema || (dataset.base_table.includes('.') ? dataset.base_table.split('.')[0] : ''));
        setSelectedFields(cfg.fields || []);
        setFilters(cfg.filters || []);
        setGroupBy(cfg.groupBy || []);
        initializedId.current = dataset.id;
      }
    } else if (restoredFormData) {
      setName(restoredFormData.name || '');
      setDescription(restoredFormData.description || '');
      setBaseTable(restoredFormData.baseTable || restoredFormData.base_table || '');
      setBaseSchema(restoredFormData.baseSchema || restoredFormData.base_schema || restoredFormData.config?.base_schema || '');
      setSelectedFields(restoredFormData.fields || []);
      setFilters(restoredFormData.filters || []);
      setGroupBy(restoredFormData.groupBy || []);
      initializedId.current = 'restored';
    } else if (initializedId.current !== 'new') {
      resetState();
      initializedId.current = 'new';
    }
  }, [dataset, isOpen, restoredFormData]);

  useEffect(() => {
    if (!isOpen && !isEditing) {
      resetState();
      initializedId.current = null;
    }
  }, [isOpen, isEditing]);

  const resetState = () => {
    setName('');
    setDescription('');
    setBaseTable('');
    setSelectedFields([]);
    setFilters([]);
    setGroupBy([]);
    setPreviewRows(null);
    setRowCount(null);
    setTruncationInfo(null);
  };

  const hasChanges = useMemo(() => {
    if (dataset) {
      const cfg = dataset.config || {};
      return name !== (dataset.name || '') ||
        description !== (dataset.description || '') ||
        baseTable !== dataset.base_table ||
        JSON.stringify(selectedFields) !== JSON.stringify(cfg.fields || []) ||
        JSON.stringify(filters) !== JSON.stringify(cfg.filters) ||
        JSON.stringify(groupBy) !== JSON.stringify(cfg.groupBy);
    }
    return name !== '' || baseTable !== '';
  }, [name, description, baseTable, selectedFields, filters, groupBy, dataset]);

  const buildConfig = () => {
    const cfg = {};
    if (baseSchema && baseSchema !== 'public') cfg.base_schema = baseSchema;
    if (selectedFields.length > 0) cfg.fields = selectedFields;
    if (filters.length > 0) cfg.filters = filters;
    if (groupBy.length > 0) cfg.groupBy = groupBy;
    return cfg;
  };

  const executeMutation = useMutation({
    mutationFn: ({ baseTable, config, extendedLimit }) => datasetsAPI.execute({ baseTable, config, extendedLimit }),
    onSuccess: (data) => {
      const resultData = data.data || {};
      setRowCount(resultData.rowCount || 0);
      setPreviewRows(resultData.rows?.slice(0, 100) || []);
      setShowPreviewDialog(true);
      if (resultData.truncated) {
        setTruncationInfo({ truncated: resultData.truncated, totalRowCount: resultData.totalRowCount || 0, rowCount: resultData.rowCount || 0, limitUsed: resultData.limitUsed || 10000, warning: data.warning || null });
      } else {
        setTruncationInfo(null);
      }
    },
    onError: (error) => {
      toast.showError(error.message || '预览查询失败');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (isEditing && dataset?.id) return datasetsAPI.update(dataset.id, data);
      return datasetsAPI.create(data);
    },
    onSuccess: () => {
      resetState();
      initializedId.current = null;
      queryClient.invalidateQueries({ queryKey: ['datasets-with-status'] });
      setTimeout(() => {
        toast.showSuccess(isEditing ? '数据集已更新' : '数据集创建成功');
        onSuccess();
      }, 200);
    },
    onError: (error) => {
      toast.showError(error.message || '保存失败');
    },
  });

  const handlePreview = () => {
    if (!baseTable) return;
    setPreviewRows(null);
    setRowCount(null);
    setTruncationInfo(null);
    executeMutation.mutate({ baseTable, config: buildConfig(), extendedLimit: false });
  };

  const handleExtendLimit = () => {
    confirmDialog.show({
      title: '加载更多数据',
      message: '这将增加查询上限至 50,000 行，可能需要更长时间执行。',
      confirmText: '继续',
      cancelText: '取消',
      onConfirm: () => executeMutation.mutate({ baseTable, config: buildConfig(), extendedLimit: true }),
    });
  };

  const handleSave = () => {
    if (!name || !baseTable) return;
    saveMutation.mutate({
      name,
      description,
      baseTable,
      config: buildConfig(),
      connectionId: activeConnection?.id || null,
    });
  };

  const handleClose = () => {
    document.activeElement?.blur();
    if (hasChanges) {
      onClose({ name, description, baseTable, config: buildConfig(), isEditing, editingDatasetId: dataset?.id });
    } else {
      onClose();
    }
  };

  const handleCancel = () => {
    resetState();
    initializedId.current = null;
    onClose();
  };

  const handleTableSelect = (table) => {
    const schema = table.table_schema || '';
    setBaseTable(schema && schema !== 'public' ? `${schema}.${table.table_name}` : table.table_name);
    setBaseSchema(schema);
    setShowTablePicker(false);
  };

  const handleFieldToggle = (field) => {
    const exists = selectedFields.some(f => f.field === field.column_name);
    if (exists) {
      setSelectedFields(selectedFields.filter(f => f.field !== field.column_name));
    } else {
      setSelectedFields([...selectedFields, { field: field.column_name }]);
    }
  };

  // 筛选条件操作
  const addFilter = () => setFilters([...filters, { field: '', operator: '=', value: '' }]);
  const removeFilter = (i) => setFilters(filters.filter((_, idx) => idx !== i));
  const updateFilter = (i, key, value) => {
    const newFilters = [...filters];
    newFilters[i] = { ...newFilters[i], [key]: value };
    setFilters(newFilters);
  };

  // 分组条件操作
  const addGroupBy = () => setGroupBy([...groupBy, '']);
  const removeGroupBy = (i) => setGroupBy(groupBy.filter((_, idx) => idx !== i));
  const updateGroupBy = (i, value) => {
    const newGroupBy = [...groupBy];
    newGroupBy[i] = value;
    setGroupBy(newGroupBy);
  };

  // 字段选择样式
  const selectSx = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.85rem',
    backgroundColor: 'white',
  };

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
{/* 主 Drawer */}
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
        {/* Header - 名称输入框作为标题 */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="输入数据集名称..."
            autoFocus={!isEditing}
            sx={{
              flex: 1,
              fontSize: '1.1rem',
              fontWeight: 600,
              '& input': { fontWeight: 600 },
            }}
          />
          <Tooltip title="关闭">
            <IconButton onClick={handleClose} size="small" sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Content - GTM 风格分区卡片 */}
        <Box sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, bgcolor: 'grey.100' }}>
          {/* 数据源配置 Section */}
          <ConfigSection title="数据源配置" icon="database">
            <Box
              onClick={() => !baseTable && setShowTablePicker(true)}
              sx={{
                border: '1px solid',
                borderColor: baseTable ? 'primary.200' : 'divider',
                borderRadius: 1.5,
                p: 2,
                bgcolor: baseTable ? 'primary.50' : 'grey.50',
                cursor: baseTable ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 60,
                transition: 'all 150ms',
                '&:hover': baseTable ? {} : { borderColor: 'primary.300', bgcolor: 'grey.100' },
              }}
            >
              {baseTable ? (
                <>
                  <Icon name="database" size={20} sx={{ color: 'primary.main' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{baseTable}</Typography>
                    <Typography variant="caption" color="text.secondary">{columns.length} 个字段</Typography>
                  </Box>
                  <Tooltip title="清除数据源">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setBaseTable(''); setSelectedFields([]); }} sx={{ color: 'text.secondary' }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Icon name="plus" size={20} sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">点击选择数据源表...</Typography>
                </>
              )}
            </Box>
          </ConfigSection>

          {/* 字段选择 Section */}
          {baseTable && (
            <ConfigSection title="字段选择" icon="columns">
              <Box
                onClick={() => setShowFieldPicker(true)}
                sx={{
                  border: '1px solid',
                  borderColor: selectedFields.length > 0 ? 'primary.200' : 'divider',
                  borderRadius: 1.5,
                  p: 2,
                  bgcolor: selectedFields.length > 0 ? 'primary.50' : 'grey.50',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: 60,
                  transition: 'all 150ms',
                  '&:hover': { borderColor: 'primary.300', bgcolor: 'grey.100' },
                }}
              >
                {selectedFields.length > 0 ? (
                  <>
                    <Icon name="columns" size={20} sx={{ color: 'primary.main' }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>已选择 {selectedFields.length} 个字段</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedFields.map(f => f.field).join(', ')}
                      </Typography>
                    </Box>
                    <Tooltip title="清除字段">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSelectedFields([]); }} sx={{ color: 'text.secondary' }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={20} sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">点击选择字段（默认全部）...</Typography>
                  </>
                )}
              </Box>
            </ConfigSection>
          )}

          {/* 筛选条件 Section */}
          {baseTable && (
            <ConfigSection
              title="筛选条件"
              icon="filter"
              subtitle={filters.length === 0 ? '无筛选条件' : `${filters.length} 条`}
              action={
                <Button variant="outline" size="sm" onClick={addFilter} sx={{ color: 'primary.main', borderColor: 'primary.main', py: 0.25, px: 1, fontSize: '0.75rem' }}>
                  <AddIcon fontSize="small" sx={{ mr: 0.25 }} />添加
                </Button>
              }
            >
              {filters.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {filters.map((filter, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <select value={filter.field || ''} onChange={e => updateFilter(i, 'field', e.target.value)} style={{ width: 140, ...selectSx }}>
                        <option value="">选择字段</option>
                        {columns.map(c => (<option key={c.column_name} value={c.column_name}>{c.column_name}</option>))}
                      </select>
                      <select value={filter.operator || '='} onChange={e => updateFilter(i, 'operator', e.target.value)} style={{ width: 100, ...selectSx }}>
                        {operators.map(op => (<option key={op.value} value={op.value}>{op.label}</option>))}
                      </select>
                      {filter.operator !== 'IS NULL' && filter.operator !== 'IS NOT NULL' && (
                        <Input type="text" value={filter.value || ''} onChange={e => updateFilter(i, 'value', e.target.value)} placeholder="值" sx={{ flex: 1, minWidth: 80 }} />
                      )}
                      <Tooltip title="删除筛选">
                        <IconButton size="small" onClick={() => removeFilter(i)} sx={{ color: 'error.main' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              )}
            </ConfigSection>
          )}

          {/* 分组条件 Section */}
          {baseTable && (
            <ConfigSection
              title="分组条件"
              icon="layerGroup"
              subtitle={groupBy.length === 0 ? '无分组条件' : `${groupBy.length} 条`}
              action={
                <Button variant="outline" size="sm" onClick={addGroupBy} sx={{ color: 'primary.main', borderColor: 'primary.main', py: 0.25, px: 1, fontSize: '0.75rem' }}>
                  <AddIcon fontSize="small" sx={{ mr: 0.25 }} />添加
                </Button>
              }
            >
              {groupBy.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {groupBy.map((g, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <select value={g || ''} onChange={e => updateGroupBy(i, e.target.value)} style={{ flex: 1, ...selectSx }}>
                        <option value="">选择字段</option>
                        {(() => {
                          const hasDim = columns.some(c => c.is_dimension || c.is_date);
                          const groupByCandidates = hasDim
                            ? columns.filter(c => c.is_dimension || c.is_date)
                            : columns.filter(c => !isNumeric(c.data_type));
                          return groupByCandidates.map(c => (
                            <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                          ));
                        })()}
                      </select>
                      <Tooltip title="删除分组">
                        <IconButton size="small" onClick={() => removeGroupBy(i)} sx={{ color: 'error.main' }}>
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
          <Button variant="outline" onClick={handleCancel}>取消</Button>
          {baseTable && (
            <Button variant="outline" onClick={handlePreview} disabled={executeMutation.isPending}>
              <Icon name="table" size={14} sx={{ mr: 0.5 }} />
              {executeMutation.isPending ? '加载中...' : '预览数据'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={!name || !baseTable || saveMutation.isPending} sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}>
            {saveMutation.isPending ? '保存中...' : (isEditing ? '保存' : '创建')}
          </Button>
        </Box>
      </Drawer>

      {/* 数据源表选择器 */}
      <Drawer
        anchor="right"
        open={showTablePicker}
        onClose={() => { document.activeElement?.blur(); setShowTablePicker(false); }}
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
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择数据源</Typography>
        </Box>
        <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
          {availableTables.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Icon name="database" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2">暂无数据源</Typography>
            </Box>
          ) : (
            availableTables.map(table => (
              <Box
                key={table.table_name}
                component="button"
                type="button"
                onClick={() => handleTableSelect(table)}
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
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{table.table_name}</Typography>
              </Box>
            ))
          )}
        </Box>
      </Drawer>

      {/* 字段选择器 - 双栏布局 */}
      <Drawer
        anchor="right"
        open={showFieldPicker}
        onClose={() => { document.activeElement?.blur(); setShowFieldPicker(false); }}
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
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择字段</Typography>
          <Typography variant="caption" color="text.secondary">已选 {selectedFields.length} 个</Typography>
        </Box>
        <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
          {columns.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">暂无字段</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5 }}>
              {columns.map(col => {
                const isSelected = selectedFields.some(f => f.field === col.column_name);
                const field = selectedFields.find(f => f.field === col.column_name);
                return (
                  <Box
                    key={col.column_name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1,
                      py: 0.75,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      bgcolor: isSelected ? 'primary.50' : 'background.paper',
                      transition: 'all 100ms',
                      '&:hover': { borderColor: 'primary.300' },
                    }}
                  >
                    <Box
                      component="button"
                      type="button"
                      onClick={() => handleFieldToggle(col)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        flex: 1,
                        cursor: 'pointer',
                        bgcolor: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ width: 16, height: 16, borderRadius: 0.5, border: '1px solid', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'primary.main' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <Box sx={{ width: 8, height: 8, bgcolor: 'primary.contrastText', borderRadius: '50%' }} />}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.column_name}</Typography>
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{col.data_type}</Typography>
                      </Box>
                    </Box>

                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button variant="outline" size="sm" onClick={() => setShowFieldPicker(false)}>取消</Button>
          <Button size="sm" onClick={() => setShowFieldPicker(false)}>确认</Button>
        </Box>
      </Drawer>

      {/* 数据预览弹窗 */}
      <Drawer
        anchor="right"
        open={showPreviewDialog}
        onClose={() => { document.activeElement?.blur(); setShowPreviewDialog(false); }}
        sx={{ zIndex: BASE_Z_INDEX + 6 }}
        slotProps={{
          paper: {
            sx: {
              width: 480,
            },
          },
          modal: {
            keepMounted: true,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>数据预览 ({rowCount || 0} 行)</Typography>
          <Tooltip title="关闭预览">
            <IconButton size="small" onClick={() => setShowPreviewDialog(false)} sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
          {truncationInfo && <TruncationIndicator {...truncationInfo} onExtend={handleExtendLimit} extendLoading={executeMutation.isPending} />}
          {previewRows && previewRows.length > 0 ? (
            <TableContainer>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {Object.keys(previewRows[0]).map(key => (
                      <TableCell key={key} sx={{ fontWeight: 600 }}>{key}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {Object.values(row).map((val, j) => (
                        <TableCell key={j}>{String(val ?? '')}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">暂无数据</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Button variant="outline" size="sm" onClick={() => setShowPreviewDialog(false)}>关闭</Button>
        </Box>
      </Drawer>

      <ConfirmDialog {...confirmDialog.props} />
    </>
  );
}
