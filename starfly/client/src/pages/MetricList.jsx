// ============================================================
// 指标列表页面 - 查看和管理所有自定义指标
// ============================================================

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metricsAPI } from '../api';
import { MetricListSkeleton } from '../components/Skeleton';
const MetricBuilderModal = React.lazy(() => import('../components/MetricBuilderModal'));
import { formatDateShort } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
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
  Fab,
  Tooltip,
} from '@mui/material';
import {
  DataGrid,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import BarChartIcon from '@mui/icons-material/BarChart';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

export default function MetricList() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingMetric, setEditingMetric] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');
  const addDeleted = useOperationLogStore((state) => state.addDeleted);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => metricsAPI.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: metricsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['metrics']);
    },
  });

  const metrics = data?.data || [];

  // 提取唯一的数据集用于筛选下拉框
  const uniqueDatasets = useMemo(() => {
    const datasets = new Map();
    metrics.forEach(m => {
      if (m.dataset_id && m.dataset_name) {
        datasets.set(m.dataset_id, { id: m.dataset_id, name: m.dataset_name });
      }
    });
    return Array.from(datasets.values());
  }, [metrics]);

  // 客户端筛选与排序（最新创建的排在前面）
  const filteredMetrics = useMemo(() => {
    return metrics
      .filter(metric => {
        const nameMatch = !searchQuery ||
          metric.name.toLowerCase().includes(searchQuery.toLowerCase());
        const datasetMatch = !selectedDataset ||
          (selectedDataset === 'table' ? !metric.dataset_id :
           String(metric.dataset_id) === selectedDataset);
        return nameMatch && datasetMatch;
      })
      .sort((a, b) => {
        // 按 id 降序（新创建的 id 更大，排在前面）
        // 或者按 created_at 降序（如果有该字段）
        const aTime = a.created_at ? new Date(a.created_at).getTime() : a.id;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : b.id;
        return bTime - aTime;
      });
  }, [metrics, searchQuery, selectedDataset]);

  // 重置筛选条件
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDataset('');
  };

  const handleDelete = useCallback((id, name) => () => {
    setDeleteConfirm({ isOpen: true, id, name });
  }, []);

  const confirmDelete = () => {
    if (deleteConfirm.id) {
      const metric = metrics.find(m => m.id === deleteConfirm.id);
      if (metric) {
        addDeleted('metric', metric.id, metric.name, {
          name: metric.name,
          description: metric.description,
          dataset_id: metric.dataset_id,
          dataset_name: metric.dataset_name,
          config: metric.config,
        });
      }
      deleteMutation.mutate(deleteConfirm.id);
      toast.showSuccess(`"${deleteConfirm.name}" 已移至操作记录`);
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
    }
  };

  const handleEdit = useCallback((metric) => () => {
    setEditingMetric(metric);
    setShowModal(true);
  }, []);

  const handleCreate = () => {
    setEditingMetric(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingMetric(null);
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingMetric(null);
    refetch();
  };

  // 列定义
  const columns = useMemo(() => [
    {
      field: 'name',
      headerName: '名称',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: 'var(--mui-palette-bg-header)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BarChartIcon sx={{ width: 16, height: 16, color: 'primary.main' }} />
          </Box>
          <Typography variant="subtitle2">{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'source',
      headerName: '来源',
      width: 180,
      valueGetter: (_, row) => {
        if (row.dataset_id && row.dataset_name) return row.dataset_name;
        if (row.config?.table) return row.config.table;
        return null;
      },
      renderCell: (params) => {
        const row = params.row;
        if (row.dataset_id && row.dataset_name) {
          return (
            <Chip
              label={row.dataset_name}
              size="small"
              sx={{
                bgcolor: 'action.selected',
                color: 'text.primary',
                fontWeight: 500,
                fontSize: 11,
              }}
            />
          );
        }
        if (row.config?.table) {
          return (
            <Chip
              label={row.config.table}
              size="small"
              sx={{
                bgcolor: 'action.selected',
                color: 'text.primary',
                fontWeight: 500,
                fontSize: 11,
              }}
            />
          );
        }
        return <Typography variant="body2" color="text.secondary">-</Typography>;
      },
    },
    {
      field: 'aggregation',
      headerName: '聚合函数',
      width: 110,
      valueGetter: (_, row) => {
        const agg = row.config?.aggregations?.[0];
        return agg?.func || '-';
      },
      renderCell: (params) => {
        const func = params.value;
        const labels = {
          SUM: '求和',
          COUNT: '计数',
          AVG: '平均值',
          MIN: '最小值',
          MAX: '最大值',
          COUNT_DISTINCT: '去重计数',
        };
        return (
          <Chip
            label={labels[func] || func}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 500, fontSize: 11 }}
          />
        );
      },
    },
    {
      field: 'weightField',
      headerName: '权重字段',
      width: 120,
      valueGetter: (_, row) => {
        const agg = row.config?.aggregations?.[0];
        return agg?.weightField || null;
      },
      renderCell: (params) => {
        if (!params.value) {
          return <Typography variant="body2" color="text.secondary">-</Typography>;
        }
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              bgcolor: 'warning.soft',
              color: 'warning.dark',
              fontWeight: 500,
              fontSize: 11,
            }}
          />
        );
      },
    },
    {
      field: 'numberFormat',
      headerName: '数值格式',
      width: 100,
      valueGetter: (_, row) => row.config?.numberFormat || 'float',
      renderCell: (params) => {
        const format = params.value;
        const labels = { integer: '整数', float: '浮点数', percentage: '百分比' };
        return (
          <Chip
            label={labels[format] || format}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 500, fontSize: 11 }}
          />
        );
      },
    },
    {
      field: 'description',
      headerName: '描述',
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'created_at',
      headerName: '创建时间',
      width: 120,
      valueGetter: (_, row) => formatDateShort(row.created_at || row.createdAt),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '操作',
      width: 160,
      getActions: (params) => [
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
  ], [handleEdit, handleDelete]);

  // 转换行数据供 DataGrid 使用（需要 id 字段）
  const rows = useMemo(() => {
    return filteredMetrics.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      dataset_id: m.dataset_id,
      dataset_name: m.dataset_name,
      config: m.config,
      numberFormat: m.config?.numberFormat || 'float',
      created_at: m.created_at,
      createdAt: m.createdAt,
    }));
  }, [filteredMetrics]);

  return (
    <PageWrapper maxWidth="xl" fullHeight>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PageHeader
          title="自定义指标"
          subtitle="定义和管理您的数据指标"
          actions={
            <Tooltip title="创建指标">
              <Fab color="primary" size="small" onClick={handleCreate}>
                <Icon name="plus" size={16} />
              </Fab>
            </Tooltip>
          }
        />

        {isLoading ? (
          <MetricListSkeleton />
        ) : metrics.length === 0 ? (
          <EmptyState
            icon="chart"
            title="暂无指标"
            description="创建您的第一个指标定义开始使用"
            action={
              <Button onClick={handleCreate}>
                <Icon name="plus" size={16} />
                创建第一个指标
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
                  placeholder="搜索指标..."
                  slotProps={{
                    input: {
                      startAdornment: <Icon name="search" size={14} sx={{ color: 'text.secondary', mr: 0.5 }} />,
                    },
                  }}
                  sx={{ flex: '1 1 auto', minWidth: 150, maxWidth: 250 }}
                />

                {/* 数据集筛选 */}
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="dataset-filter-label">来源</InputLabel>
                  <Select
                    labelId="dataset-filter-label"
                    value={selectedDataset}
                    onChange={(e) => setSelectedDataset(e.target.value)}
                    label="来源"
                    onClose={() => document.activeElement?.blur()}
                  >
                    <MenuItem value="">全部</MenuItem>
                    <MenuItem value="table">直接引用表</MenuItem>
                    {uniqueDatasets.map(d => (
                      <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* 结果计数 */}
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {filteredMetrics.length} 条结果
                </Typography>

                {/* 重置按钮 */}
                {(searchQuery || selectedDataset) && (
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
                sx={{
                  border: 'none',
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
                        未找到匹配的指标
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
          <MetricBuilderModal
            isOpen={showModal}
            metric={editingMetric}
            onClose={handleCloseModal}
            onSuccess={handleModalSuccess}
          />
        </Suspense>

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
