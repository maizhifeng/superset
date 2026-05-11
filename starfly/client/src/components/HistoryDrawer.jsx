import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOperationLogStore } from '../store';
import { dashboardsAPI, datasetsAPI, metricsAPI } from '../api';
import { queryKeys } from '../api/queryKeys';
import { formatDateWithTime } from '@/utils/formatters';
import { useToast } from '@/components/Toast';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

const iOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const DRAWER_CLOSE_DELAY = 800;

// 实体类型图标映射
const ENTITY_ICONS = {
  widget: 'chart',
  dashboard: 'dashboard',
  dataset: 'database',
  metric: 'barChart3',
};

export default function HistoryDrawer({ isOpen, dashboardId, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { items, remove, clearByType, getByDashboard } = useOperationLogStore();
  const [activeTab, setActiveTab] = useState(0);

  // 存储待恢复草稿到 sessionStorage，然后触发恢复事件
  const applyDraftToEditor = (item) => {
    // 存储待恢复草稿
    sessionStorage.setItem('pendingDraftRestore', JSON.stringify({
      entityType: item.entityType,
      data: item.data,
      context: item.context,
      createdAt: new Date().toISOString(),
    }));

    // 从操作记录中移除
    remove(item.id);

    // 关闭 drawer
    onClose();

    // 触发自定义事件，让当前已挂载的目标页面组件监听
    // （如果用户已在目标页面，导航不会触发组件重新挂载）
    window.dispatchEvent(new CustomEvent('draftRestoreTrigger', {
      detail: { entityType: item.entityType, context: item.context }
    }));

    // 根据实体类型导航到目标页面
    // 目标组件挂载后会检测 sessionStorage 并自动打开编辑器
    if (item.entityType === 'widget') {
      navigate(`/dashboards/${item.context?.dashboardId}`);
    } else if (item.entityType === 'dataset') {
      navigate('/datasets');
    } else if (item.entityType === 'metric') {
      navigate('/metrics');
    } else if (item.entityType === 'dashboard') {
      navigate('/dashboards');
    }

    toast.showSuccess('草稿已发送到编辑器');
  };

  // 过滤当前 dashboard 相关项目或显示全部
  const filteredItems = useMemo(() => {
    let filtered = dashboardId
      ? getByDashboard(dashboardId)
      : items;

    // Tab 过滤
    if (activeTab === 1) {
      filtered = filtered.filter(item => item.status === 'deleted');
    } else if (activeTab === 2) {
      filtered = filtered.filter(item => item.status === 'draft');
    }

    // 按时间倒序排列
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [items, dashboardId, activeTab, getByDashboard]);

  // 统计数量
  const counts = useMemo(() => ({
    all: items.length,
    deleted: items.filter(i => i.status === 'deleted').length,
    draft: items.filter(i => i.status === 'draft').length,
  }), [items]);

  const handleRestore = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // 草稿项：直接应用到编辑器
    if (item.status === 'draft') {
      applyDraftToEditor(item);
      return;
    }

    // 删除项恢复 - 调用 API
    try {
      if (item.entityType === 'widget') {
        // Widget 数据格式转换：snake_case → camelCase
        const widgetData = item.data;
        await dashboardsAPI.addWidget(item.context?.dashboardId, {
          title: widgetData.title || '未命名',
          metricId: widgetData.metric_id,
          metricIds: widgetData.metric_ids || (widgetData.metric_id ? [widgetData.metric_id] : []),
          config: widgetData.config || {},
          position: widgetData.position || { x: 0, y: 0, w: 2, h: 1 },
          type: widgetData.type || 'chart',
        });
        queryClient.invalidateQueries(queryKeys.dashboard(item.context?.dashboardId));
      } else if (item.entityType === 'dashboard') {
        // Dashboard 创建
        await dashboardsAPI.create({
          name: item.data.name || '未命名仪表盘',
          description: item.data.description || '',
          layout: item.data.layout || { cols: 12, rows: 8 },
        });
        queryClient.invalidateQueries(['dashboards']);
      } else if (item.entityType === 'dataset') {
        // Dataset 创建：snake_case → camelCase
        await datasetsAPI.create({
          name: item.data.name || '未命名数据集',
          description: item.data.description || '',
          baseTable: item.data.base_table || item.data.baseTable,
          config: item.data.config || {},
        });
        queryClient.invalidateQueries(['datasets']);
      } else if (item.entityType === 'metric') {
        // Metric 创建
        await metricsAPI.create({
          name: item.data.name || '未命名指标',
          description: item.data.description || '',
          dataset_id: item.data.dataset_id,
          config: item.data.config || {},
        });
        queryClient.invalidateQueries(['metrics']);
      }

      remove(itemId);
      toast.showSuccess(`"${item.name}" 已恢复`);

      if (filteredItems.length <= 1) {
        setTimeout(() => onClose(), DRAWER_CLOSE_DELAY);
      }
    } catch (error) {
      toast.showError(`恢复失败: ${error.message || '请重试'}`);
    }
  };

  const handlePermanentDelete = (itemId) => {
    const item = items.find(i => i.id === itemId);
    remove(itemId);
    toast.showWarning(`"${item?.name}" 已永久删除`);
    if (filteredItems.length <= 1) {
      setTimeout(() => onClose(), DRAWER_CLOSE_DELAY);
    }
  };

  const handleClearDeleted = () => {
    clearByType('deleted');
    toast.showInfo('已清空所有删除记录');
    setTimeout(() => onClose(), DRAWER_CLOSE_DELAY);
  };

  const handleClearDrafts = () => {
    clearByType('draft');
    toast.showInfo('已清空所有草稿');
    setTimeout(() => onClose(), DRAWER_CLOSE_DELAY);
  };

  const handleClearAll = () => {
    clearByType('deleted');
    clearByType('draft');
    toast.showInfo('已清空所有记录');
    setTimeout(() => onClose(), DRAWER_CLOSE_DELAY);
  };

  // 拖拽指示器
  const DragHandle = () => (
    <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.5, mb: 1 }} />
  );

  // 获取实体引用信息（返回数组以支持多个引用）
  const getEntityReferences = (item) => {
    const refs = [];

    if (item.entityType === 'widget') {
      // 仪表盘来源
      if (item.context?.dashboardName) {
        refs.push({ label: '仪表盘', value: item.context.dashboardName });
      }
      // 数据集或表引用
      const selectedTable = item.data?.selectedTable;
      if (selectedTable) {
        if (selectedTable.startsWith('dataset:')) {
          refs.push({ label: '数据集', value: selectedTable.slice(8) });
        } else {
          refs.push({ label: '表', value: selectedTable });
        }
      }
    }

    if (item.entityType === 'dataset') {
      const table = item.data?.base_table || item.data?.baseTable;
      if (table) refs.push({ label: '基础表', value: table });
    }

    if (item.entityType === 'metric') {
      const dataset = item.data?.dataset_name;
      const table = item.data?.config?.table;
      if (dataset) refs.push({ label: '数据集', value: dataset });
      else if (table) refs.push({ label: '表', value: table });
    }

    return refs;
  };

  // 单个项目卡片
  const ItemCard = ({ item }) => {
    const entityIcon = ENTITY_ICONS[item.entityType];
    const references = getEntityReferences(item);

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          backgroundColor: 'background.paper',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          transition: 'background-color 150ms ease',
          '&:hover': { backgroundColor: 'action.hover' },
        }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
            {/* 实体图标 */}
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                bgcolor: item.status === 'deleted' ? 'error.50' : 'warning.50',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={entityIcon} size={18} sx={{ color: item.status === 'deleted' ? 'error.main' : 'warning.main' }} />
            </Box>

            {/* 信息 */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {item.name || '未命名'}
                </Typography>
                {references.map((ref, idx) => (
                  <Chip
                    key={idx}
                    label={ref.value}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      bgcolor: ref.label === '仪表盘' ? 'primary.50' : 'success.50',
                      color: ref.label === '仪表盘' ? 'primary.main' : 'success.main',
                    }}
                  />
                ))}
                <Chip
                  label={formatDateWithTime(item.createdAt)}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 11,
                    bgcolor: 'grey.100',
                    color: 'text.secondary',
                  }}
                />
              </Box>
            </Box>
          </Box>

          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
            <IconButton
              size="small"
              onClick={() => handleRestore(item.id)}
              title={item.status === 'draft' ? '恢复到编辑器' : '恢复'}
              sx={{
                color: item.status === 'deleted' ? 'primary.main' : 'warning.main',
                '&:hover': {
                  backgroundColor: item.status === 'deleted' ? 'primary.main' : 'warning.main',
                  color: 'primary.contrastText',
                },
              }}
            >
              <Icon name="undo" size={18} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handlePermanentDelete(item.id)}
              title="永久删除"
              sx={{
                color: 'error.main',
                '&:hover': { backgroundColor: 'error.main', color: 'error.contrastText' },
              }}
            >
              <Icon name="close" size={18} />
            </IconButton>
          </Box>
        </Box>
    );
  };

  // Drawer 内容
  const drawerContent = (
    <Box sx={{ px: 3, pb: 3, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} role="presentation">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Icon name="history" size={20} sx={{ color: 'text.secondary' }} />
          <Typography variant="h6">操作记录</Typography>
          <Chip
            label={`${items.length} 项`}
            size="small"
            sx={{
              height: 22,
              fontSize: 12,
              bgcolor: 'grey.100',
              color: 'text.secondary',
            }}
          />
        </Box>
        <Tooltip title="关闭">
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <Icon name="close" size={18} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab label="全部" />
        <Tab label="已删除" />
        <Tab label="草稿" />
      </Tabs>

      <Divider sx={{ mb: 2 }} />

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <Icon name="empty" size={48} sx={{ display: 'block', mx: 'auto', mb: 2, color: 'text.disabled' }} />
            <Typography variant="body1" color="text.secondary">
              {activeTab === 1 ? '没有已删除的项目' : activeTab === 2 ? '没有草稿' : '操作记录为空'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {items.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: '1px solid', borderColor: 'divider', mt: 2 }}>
          {activeTab === 1 && counts.deleted > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearDeleted} sx={{ color: 'error.main' }}>
              <Icon name="trash" size={16} sx={{ mr: 0.5 }} />
              清空删除记录
            </Button>
          )}
          {activeTab === 2 && counts.draft > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearDrafts} sx={{ color: 'warning.main' }}>
              <Icon name="trash" size={16} sx={{ mr: 0.5 }} />
              清空草稿
            </Button>
          )}
          {activeTab === 0 && items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAll} sx={{ color: 'error.main' }}>
              <Icon name="trash" size={16} sx={{ mr: 0.5 }} />
              清空全部
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </Box>
      )}

      {items.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2, borderTop: '1px solid', borderColor: 'divider', mt: 2 }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </Box>
      )}
    </Box>
  );

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={isOpen}
      onClose={() => { document.activeElement?.blur(); onClose?.(); }}
      onOpen={() => {}}
      disableBackdropTransition={!iOS}
      disableDiscovery={iOS}
      swipeAreaWidth={20}
      slotProps={{
        modal: { keepMounted: true },
        paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, bgcolor: 'background.default' } }
      }}
    >
      <DragHandle />
      {drawerContent}
    </SwipeableDrawer>
  );
}
