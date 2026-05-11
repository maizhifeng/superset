// ============================================================
// 数据集管理页面 - 查看和管理可复用的数据源定义
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasetsAPI, dbAPI } from '../api';
import { useDBStore } from '../store';
const DatasetBuilderSheet = React.lazy(() => import('../components/DatasetBuilderModal/index'));
import TruncationIndicator from '../components/TruncationIndicator';
import { formatDateShort, formatDisplayValue } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { PageWrapper, PageHeader, EmptyState } from '@/components/layouts';
import { useOperationLogStore } from '../store';
import { useToast } from '@/components/Toast';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Chip,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Fab,
  Tooltip,
} from '@mui/material';
import {
  DataGrid,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import StorageIcon from '@mui/icons-material/Storage';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';

export default function Datasets() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showSheet, setShowSheet] = useState(false);
  const [editingDataset, setEditingDataset] = useState(null);
  const [clearDraftSignal, setClearDraftSignal] = useState(false);
  const [restoredFormData, setRestoredFormData] = useState(null);
  const [draftCheckKey, setDraftCheckKey] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBaseTable, setSelectedBaseTable] = useState('');
  const addDeleted = useOperationLogStore((state) => state.addDeleted);
  const addDraft = useOperationLogStore((state) => state.addDraft);

  // 草稿恢复检查
  useEffect(() => {
    const pendingDraft = sessionStorage.getItem('pendingDraftRestore');
    if (pendingDraft) {
      try {
        const draft = JSON.parse(pendingDraft);
        if (draft.entityType === 'dataset') {
          setRestoredFormData(draft.data);
          setShowSheet(true);
          sessionStorage.removeItem('pendingDraftRestore');
        }
      } catch (e) {
        sessionStorage.removeItem('pendingDraftRestore');
      }
    }
  }, [draftCheckKey]);

  useEffect(() => {
    const handleDraftRestore = (event) => {
      if (event.detail?.entityType === 'dataset') {
        setDraftCheckKey(k => k + 1);
      }
    };
    window.addEventListener('draftRestoreTrigger', handleDraftRestore);
    return () => window.removeEventListener('draftRestoreTrigger', handleDraftRestore);
  }, []);

  useEffect(() => {
    if (!showSheet) {
      setRestoredFormData(null);
    }
  }, [showSheet]);

  // 预览状态
  const [previewingDataset, setPreviewingDataset] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewFieldMeta, setPreviewFieldMeta] = useState({});
  const [previewTruncation, setPreviewTruncation] = useState(null);
  const [extendedLimit, setExtendedLimit] = useState(false);

  const { connections } = useDBStore();

  const { data, isLoading } = useQuery({
    queryKey: ['datasets-with-status'],
    queryFn: datasetsAPI.listWithStatus,
  });

  useQuery({
    queryKey: ['db-connections'],
    queryFn: dbAPI.getConnections,
    onSuccess: (res) => {
      if (res?.data) {
        const store = useDBStore.getState();
        store.setConnections(res.data);
        if (res.activeId && !store.activeConnection) {
          const active = res.data.find(c => c.id === res.activeId);
          if (active) store.setActiveConnection(active);
        }
      }
    },
  });

  // 预览查询变更
  const previewMutation = useMutation({
    mutationFn: ({ dataset, extendedLimit }) =>
      datasetsAPI.execute({
        baseTable: dataset.base_table,
        config: dataset.config || {},
        extendedLimit,
      }),
    onSuccess: (data) => {
      setPreviewData(data.data.rows?.slice(0, 100) || []);
      setPreviewFieldMeta(data.fieldMeta || {});
      const resultData = data.data;
      if (resultData.truncated) {
        setPreviewTruncation({
          truncated: resultData.truncated,
          totalRowCount: resultData.totalRowCount,
          rowCount: resultData.rowCount,
          limitUsed: resultData.limitUsed,
          warning: data.warning || null,
        });
      } else {
        setPreviewTruncation(null);
      }
    },
    onError: (error) => {
      toast.showError(error.message || '预览查询失败');
    },
  });

  const handlePreviewDataset = useCallback((dataset) => () => {
    setPreviewingDataset(dataset);
    setPreviewData(null);
    setPreviewTruncation(null);
    setExtendedLimit(false);
    previewMutation.mutate({ dataset, extendedLimit: false });
  }, [previewMutation]);

  const handleExtendPreviewLimit = () => {
    setExtendedLimit(true);
    previewMutation.mutate({ dataset: previewingDataset, extendedLimit: true });
  };

  const closePreview = () => {
    setPreviewingDataset(null);
    setPreviewData(null);
    setPreviewTruncation(null);
    setExtendedLimit(false);
  };

  const deleteMutation = useMutation({
    mutationFn: datasetsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets-with-status'] });
    },
    onError: (error) => {
      toast.showError(error.message || '删除失败，请先删除关联的指标');
    },
  });

  const datasets = data?.data || [];

  // 唯一的基础表列表
  const uniqueBaseTables = useMemo(() => {
    const tables = new Set();
    datasets.forEach(d => {
      if (d.base_table) tables.add(d.base_table);
    });
    return Array.from(tables).sort();
  }, [datasets]);

  // 客户端筛选
  const filteredDatasets = useMemo(() => {
    return datasets.filter(dataset => {
      const nameMatch = !searchQuery ||
        dataset.name.toLowerCase().includes(searchQuery.toLowerCase());
      const tableMatch = !selectedBaseTable ||
        dataset.base_table === selectedBaseTable;
      return nameMatch && tableMatch;
    });
  }, [datasets, searchQuery, selectedBaseTable]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedBaseTable('');
  };

  const handleDelete = useCallback((id, name) => () => {
    setDeleteConfirm({ isOpen: true, id, name });
  }, []);

  const confirmDelete = () => {
    if (deleteConfirm.id) {
      const dataset = datasets.find(d => d.id === deleteConfirm.id);
      if (dataset) {
        addDeleted('dataset', dataset.id, dataset.name, {
          name: dataset.name,
          description: dataset.description,
          base_table: dataset.base_table,
          baseTable: dataset.base_table,
          config: dataset.config,
        });
      }
      deleteMutation.mutate(deleteConfirm.id, {
        onSuccess: () => {
          toast.showSuccess(`"${deleteConfirm.name}" 已移至操作记录`);
        },
      });
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
    }
  };

  const handleCreate = () => {
    handleClearDraft();
    setShowSheet(true);
  };

  const handleEdit = useCallback((dataset) => () => {
    setEditingDataset(dataset);
    setShowSheet(true);
  }, []);

  const handleCloseSheet = (unsavedChanges) => {
    setShowSheet(false);
    if (unsavedChanges) {
      const entityId = unsavedChanges.editingDatasetId || `new-${Date.now()}`;
      const entityName = unsavedChanges.name || '未命名数据集';
      addDraft('dataset', entityId, entityName, {
        name: unsavedChanges.name,
        description: unsavedChanges.description,
        baseTable: unsavedChanges.baseTable,
        config: unsavedChanges.config,
        isEditing: unsavedChanges.isEditing,
        editingDatasetId: unsavedChanges.editingDatasetId,
      });
    }
  };

  const handleSheetSuccess = () => {
    setShowSheet(false);
    setEditingDataset(null);
  };

  const handleClearDraft = () => {
    setEditingDataset(null);
  };

  const getConnectionState = useCallback((row) => {
    if (row.connection_id) {
      if (!row.connection_exists) return 'orphan';
      if (!row.connection_active) return 'inactive';
      return 'active';
    }
    return row.connection_name ? 'active' : 'none';
  }, []);

  const rowOpacity = useCallback((state) => {
    if (state === 'orphan') return 0.45;
    if (state === 'inactive') return 0.6;
    return 1;
  }, []);

  // 列定义
  const columns = useMemo(() => [
    {
      field: 'name',
      headerName: '名称',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => {
        const row = params.row;
        const state = getConnectionState(row);
        const dimmed = state !== 'active' && state !== 'none';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, opacity: rowOpacity(state) }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: dimmed ? 'action.disabledBackground' : 'var(--mui-palette-bg-header)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <StorageIcon sx={{ width: 16, height: 16, color: dimmed ? 'text.disabled' : 'primary.main' }} />
            </Box>
            <Typography variant="subtitle2" sx={{ color: dimmed ? 'text.disabled' : 'text.primary' }}>
              {params.value}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'base_table',
      headerName: '基础表',
      width: 150,
      renderCell: (params) => {
        const state = getConnectionState(params.row);
        const dimmed = state !== 'active' && state !== 'none';
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              bgcolor: dimmed ? 'action.disabledBackground' : 'action.selected',
              color: dimmed ? 'text.disabled' : 'text.primary',
              fontWeight: 500,
              fontSize: 11,
            }}
          />
        );
      },
    },
    {
      field: 'connection_name',
      headerName: '数据源',
      width: 200,
      renderCell: (params) => {
        const row = params.row;
        const state = getConnectionState(row);
        if (state === 'none') return <Typography variant="body2" color="text.secondary">-</Typography>;
        if (state === 'orphan') {
          return (
            <Chip label="数据源已删除" size="small" color="error" variant="outlined" sx={{ fontSize: 11 }} />
          );
        }
        return (
          <Chip
            label={row.connection_name}
            size="small"
            color={state === 'active' ? 'primary' : 'default'}
            variant={state === 'active' ? 'filled' : 'outlined'}
            sx={{ fontSize: 11 }}
          />
        );
      },
    },
    {
      field: 'description',
      headerName: '描述',
      flex: 1,
      minWidth: 150,
      renderCell: (params) => {
        const state = getConnectionState(params.row);
        const dimmed = state !== 'active' && state !== 'none';
        return (
          <Typography
            variant="body2"
            color={dimmed ? 'text.disabled' : 'text.secondary'}
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {params.value || '-'}
          </Typography>
        );
      },
    },
    {
      field: 'created_at',
      headerName: '创建时间',
      width: 120,
      valueGetter: (_, row) => formatDateShort(row.created_at),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '操作',
      width: 160,
      getActions: (params) => [
        <GridActionsCellItem
          key="preview"
          icon={<VisibilityIcon fontSize="small" />}
          label="预览"
          onClick={handlePreviewDataset(params.row)}
          showInMenu={false}
          sx={{ color: 'text.secondary' }}
        />,
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon fontSize="small" />}
          label="编辑"
          onClick={handleEdit(params.row)}
          showInMenu={false}
          sx={{ color: 'primary.main' }}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon fontSize="small" />}
          label="删除"
          onClick={handleDelete(params.row.id, params.row.name)}
          showInMenu={false}
          sx={{ color: 'error.main' }}
        />,
      ],
    },
  ], [handlePreviewDataset, handleEdit, handleDelete]);

  // 转换行数据供 DataGrid 使用
  const rows = useMemo(() => {
    return filteredDatasets.map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      base_table: d.base_table,
      config: d.config,
      created_at: d.created_at,
      connection_id: d.connection_id,
      connection_name: d.connection_name,
      connection_active: d.connection_active,
      connection_exists: d.connection_exists,
    }));
  }, [filteredDatasets]);

  return (
    <PageWrapper maxWidth="xl" fullHeight>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PageHeader
          title="数据集"
          subtitle="管理可复用的数据源定义"
          actions={
            <Tooltip title="创建数据集">
              <Fab color="primary" size="small" onClick={handleCreate}>
                <Icon name="plus" size={16} />
              </Fab>
            </Tooltip>
          }
        />

      {isLoading ? (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            p: 4,
            textAlign: 'center',
          }}
        >
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            加载数据集中...
          </Typography>
        </Paper>
      ) : datasets.length === 0 ? (
        <EmptyState
          icon="database"
          title="暂无数据集"
          description="创建您的第一个数据集定义开始使用"
          action={
            <Button onClick={handleCreate}>
              <Icon name="plus" size={16} />
              创建第一个数据集
            </Button>
          }
        />
      ) : (
        <>
          {/* 筛选栏 */}
          <Paper
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
              borderRadius: 1,
              px: 1.5,
              py: 1,
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {/* 搜索 */}
              <TextField
                size="small"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索数据集..."
                slotProps={{
                  input: {
                    startAdornment: <Icon name="search" size={14} sx={{ color: 'text.secondary', mr: 0.5 }} />,
                  },
                }}
                sx={{ flex: '1 1 auto', minWidth: 150, maxWidth: 250 }}
              />

              {/* 基础表筛选 */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="base-table-filter-label">基础表</InputLabel>
                <Select
                  labelId="base-table-filter-label"
                  value={selectedBaseTable}
                  onChange={(e) => setSelectedBaseTable(e.target.value)}
                  label="基础表"
                  onClose={() => document.activeElement?.blur()}
                >
                  <MenuItem value="">全部</MenuItem>
                  {uniqueBaseTables.map(t => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* 结果计数 */}
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {filteredDatasets.length} 条结果
              </Typography>

              {/* 重置按钮 */}
              {(searchQuery || selectedBaseTable) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  sx={{ color: 'primary.main' }}
                  startIcon={<Icon name="undo" size={12} />}
                >
                  重置
                </Button>
              )}
            </Box>
          </Paper>

          {/* 数据表格 */}
          <Paper
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <DataGrid
                rows={rows}
                columns={columns}
                pageSizeOptions={[10, 20, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 20 } },
                }}
                disableRowSelectionOnClick
                getRowClassName={(params) => {
                  const state = getConnectionState(params.row);
                  if (state === 'orphan') return 'row-orphan';
                  if (state === 'inactive') return 'row-inactive';
                  return '';
                }}
                sx={{
                  border: 'none',
                  '& .row-orphan': {
                    opacity: 0.45,
                    pointerEvents: 'none',
                    '& .MuiDataGrid-cell': { color: 'text.disabled' },
                  },
                  '& .row-inactive': {
                    opacity: 0.6,
                    '& .MuiDataGrid-cell': { color: 'text.disabled' },
                  },
                // 表头样式 — 含边框和背景
                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: 'bg.header',
                  borderBottom: '2px solid',
                  borderColor: 'divider',
                },
                '& .MuiDataGrid-columnHeader': {
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontWeight: 600,
                },
                // 底部（分页）样式 — 含边框和背景
                '& .MuiDataGrid-footerContainer': {
                  bgcolor: 'bg.header',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                },
                // 行悬停效果
                '& .MuiDataGrid-row:hover': {
                  bgcolor: 'action.hover',
                },
                // 单元格样式
                '& .MuiDataGrid-cell': {
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
                  outline: 'none',
                },
              }}
              slots={{
                noRowsOverlay: () => (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 4 }}>
                    <Icon name="search" size={24} sx={{ mb: 1, color: 'text.secondary', opacity: 0.5 }} />
                    <Typography color="text.secondary" sx={{ mb: 1 }}>
                      未找到匹配的数据集
                    </Typography>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetFilters}
                      sx={{ color: 'primary.main' }}
                    >
                      清除筛选条件
                    </Button>
                  </Box>
                ),
              }}
            />
          </Paper>
        </>
      )}

      <Suspense fallback={null}>
        <DatasetBuilderSheet
          isOpen={showSheet}
          dataset={editingDataset}
          clearDraftSignal={clearDraftSignal}
          onClearDraftHandled={() => setClearDraftSignal(false)}
          onClose={handleCloseSheet}
          onSuccess={handleSheetSuccess}
          restoredFormData={restoredFormData}
        />
      </Suspense>

      {/* 预览对话框 */}
      <Dialog open={!!previewingDataset} onClose={() => { document.activeElement?.blur(); closePreview(); }}>
        <DialogContent sx={{ width: '100%', height: '100%', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', p: 0 }}>
          <DialogHeader sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Icon name="eye" size={16} sx={{ color: 'text.secondary' }} />
              预览: {previewingDataset?.name}
            </DialogTitle>
          </DialogHeader>

          {previewTruncation && (
            <Box sx={{ px: 2, py: 1, flexShrink: 0 }}>
              <TruncationIndicator
                {...previewTruncation}
                onExtendLimit={handleExtendPreviewLimit}
                extendedLimitEnabled={extendedLimit}
              />
            </Box>
          )}

          {previewMutation.isPending && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, flex: 1 }}>
              <CircularProgress size={24} sx={{ mr: 1 }} />
              <Typography variant="body2" color="text.secondary">
                加载中...
              </Typography>
            </Box>
          )}

          {!previewMutation.isPending && previewData && previewData.length > 0 && (
            <Box sx={{ overflow: 'auto', flex: 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {Object.keys(previewData[0]).map(key => (
                      <TableCell key={key} sx={{ fontWeight: 500, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {key}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewData.map((row, i) => (
                    <TableRow key={i} hover>
                      {Object.entries(row).map(([colName, val], j) => {
                        const isDim = previewFieldMeta[colName]?.is_dimension;
                        const formatted = val === null ? '-'
                          : typeof val === 'number' && !isDim ? formatDisplayValue(val)
                          : String(val);
                        return (
                          <TableCell key={j} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatted}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {!previewMutation.isPending && previewData && previewData.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary', flex: 1 }}>
              <Icon name="empty" size={32} sx={{ mx: 'auto', mb: 1, display: 'block', color: 'text.secondary', opacity: 0.5 }} />
              <Typography variant="body2">无数据</Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Button variant="outline" onClick={closePreview}>
              关闭
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="移至操作记录"
        message={`"${deleteConfirm.name}" 将移至操作记录，可随时恢复。`}
        confirmText="移至操作记录"
        cancelText="取消"
        isDanger={false}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
      />
      </Box>
    </PageWrapper>
  );
}