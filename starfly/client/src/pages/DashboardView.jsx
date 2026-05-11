// ============================================================
// 仪表盘视图页面 - 仪表盘图表布局与交互管理
// ============================================================

import React, { useState, useCallback, useLayoutEffect, useRef, useEffect, useMemo, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardsAPI, widgetsAPI } from '../api';
import { queryKeys } from '../api/queryKeys';
import GridLayout from 'react-grid-layout';
import { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import ChartWidget from '../components/ChartWidget';
import ErrorBoundary from '../components/ErrorBoundary';
const AddWidgetModal = React.lazy(() => import('../components/AddWidgetModal/index'));
import { DashboardSkeleton } from '../components/Skeleton';
import { useTrashStore, useDashboardLayoutStore, useOperationLogStore, useDashboardStore } from '../store';
import { useToast } from '@/components/Toast';
import { Icon } from '@/components/ui/icon';
import { Box, Typography, Button, Fab, Tooltip } from '@mui/material';

const ResponsiveGridLayout = WidthProvider(GridLayout);

const GRID_MARGIN = [8, 8];
const DEFAULT_COLS = 12;
const DEFAULT_COL_WIDTH = 80;



function sanitizeLayout(layout) {
  return layout.map(item => ({
    i: String(item.i),
    x: typeof item.x === 'number' ? item.x : 0,
    y: typeof item.y === 'number' ? item.y : 0,
    w: typeof item.w === 'number' ? Math.max(item.w, 1) : 3,
    h: typeof item.h === 'number' ? Math.max(item.h, 1) : 1,
    minW: 1,
    minH: 1,
  }));
}

function compactLayout(layout, cols) {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];

  for (const item of sorted) {
    const { w, h } = item;
    let x = 0, y = 0;

    for (let iter = 0; iter < 500; iter++) {
      const hit = placed.find(p =>
        p.x < x + w && p.x + p.w > x && p.y < y + h && p.y + p.h > y
      );
      if (!hit) break;
      x++;
      if (x + w > cols) { x = 0; y++; }
    }

    placed.push({ ...item, x, y });
  }

  const map = {};
  placed.forEach(p => { map[p.i] = p; });
  return layout.map(item => ({ ...item, x: map[item.i].x, y: map[item.i].y }));
}

export default function DashboardView() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const addToTrash = useTrashStore((state) => state.addToTrash);
  const addDraft = useOperationLogStore((state) => state.addDraft);

  // 布局存储
  const storeGetLayout = useDashboardLayoutStore((state) => state.getLayout);
  const storeSetLayout = useDashboardLayoutStore((state) => state.setLayout);

  // 模态框状态整合（是否打开、编辑中的组件ID、恢复的表单数据）
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState(null);
  const [restoredFormData, setRestoredFormData] = useState(null);
  const editCounterRef = useRef(0);
  const configHistoryRef = useRef({});

  // 打开编辑模式模态框
  const openEditModal = useCallback(async (widget) => {
    editCounterRef.current += 1;
    if (widget?.id) {
      configHistoryRef.current[widget.id] = JSON.parse(JSON.stringify(widget.config || {}));
    }
    setEditingWidgetId(widget?.id);
    setRestoredFormData(null);
    const state = queryClient.getQueryState(queryKeys.dashboard(id));
    if (!state || state.isStale || state.dataUpdateCount === 0) {
      await queryClient.refetchQueries({ queryKey: queryKeys.dashboard(id) });
    }
    setModalOpen(true);
  }, [id, queryClient]);

  const handleConfigUndo = useCallback(async (widgetId) => {
    const prevConfig = configHistoryRef.current[widgetId];
    if (!prevConfig) return;
    delete configHistoryRef.current[widgetId];
    try {
      await dashboardsAPI.updateWidget(widgetId, { config: prevConfig });
      queryClient.invalidateQueries(queryKeys.dashboard(id));
      queryClient.invalidateQueries(queryKeys.widget(widgetId));
      toast.showSuccess('已撤回修改');
    } catch (err) {
      toast.showError('撤回失败: ' + (err.message || ''));
    }
  }, [id, queryClient, toast]);

  // 本地布局状态
  const [layout, setLocalLayout] = useState(() => storeGetLayout(id));
  const prevIdRef = useRef(id);

  const [isResizing, setIsResizing] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const isUserDragging = useRef(false);
  const gridContainerRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 网格配置状态整合
  const [gridConfig, setGridConfig] = useState({ cols: DEFAULT_COLS, colWidth: DEFAULT_COL_WIDTH });

  // 打开新增模式模态框
  const openAddModal = useCallback((restoredData = null) => {
    setEditingWidgetId(null);
    setRestoredFormData(restoredData);
    setModalOpen(true);
  }, []);

  // 关闭模态框
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingWidgetId(null);
    setRestoredFormData(null);
  }, []);

  // 草稿恢复检测
  useLayoutEffect(() => {
    const pendingDraft = sessionStorage.getItem('pendingDraftRestore');
    if (pendingDraft) {
      try {
        const draft = JSON.parse(pendingDraft);
        if (draft.entityType === 'widget' && draft.context?.dashboardId === id) {
          openAddModal(draft.data);
          sessionStorage.removeItem('pendingDraftRestore');
        }
      } catch (e) {
        sessionStorage.removeItem('pendingDraftRestore');
      }
    }
  }, [id, openAddModal]);

  // 草稿恢复事件监听
  useEffect(() => {
    const handleDraftRestore = (event) => {
      if (event.detail?.entityType === 'widget' && event.detail?.context?.dashboardId === id) {
        openAddModal();
      }
    };
    window.addEventListener('draftRestoreTrigger', handleDraftRestore);
    return () => window.removeEventListener('draftRestoreTrigger', handleDraftRestore);
  }, [id, openAddModal]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(id),
    queryFn: () => dashboardsAPI.get(id),
  });

  const deleteWidgetMutation = useMutation({
    mutationFn: (widgetId) => dashboardsAPI.deleteWidget(widgetId),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.dashboard(id));
    },
  });

  const dashboard = data?.data;
  const widgets = dashboard?.widgets || [];
  const widgetIds = useMemo(() => widgets.map(w => w.id), [widgets]);

  // 批量查询组件数据 — 一次性请求仪表盘上的所有组件
  const { data: batchWidgetData } = useQuery({
    queryKey: ['widgetBatch', id, widgetIds],
    queryFn: () => widgetsAPI.batchQuery(widgetIds),
    enabled: widgetIds.length > 0,
    staleTime: 10000,
  });

  const prefetchedData = useMemo(() => {
    if (!batchWidgetData?.data) return null;
    return batchWidgetData.data;
  }, [batchWidgetData]);

  // 从最新的 widgets 数组中动态获取编辑中的组件
  // 确保全屏保存后的配置变更能在编辑模态框中反映
  const editingWidget = useMemo(() => {
    if (!editingWidgetId) return null;
    return widgets.find(w => w.id === editingWidgetId);
  }, [editingWidgetId, widgets]);

  // 同步仪表盘信息到存储
  useEffect(() => {
    if (dashboard) {
      const existing = useDashboardStore.getState().dashboards;
      const exists = existing.some(d => d.id === dashboard.id);
      if (!exists) {
        useDashboardStore.getState().setDashboards([...existing, { id: dashboard.id, name: dashboard.name }]);
      }
      useDashboardStore.getState().setSelectedDashboard(dashboard);
    }
  }, [dashboard]);

  // 布局初始化与同步
  const getLayoutRef = useRef(storeGetLayout);
  const setLayoutRef = useRef(storeSetLayout);
  getLayoutRef.current = storeGetLayout;
  setLayoutRef.current = storeSetLayout;

  const layoutSyncedRef = useRef(false);

  useLayoutEffect(() => {
    if (layoutSyncedRef.current && !isLoading) return;
    if (isLoading) return;

    const storeLayout = getLayoutRef.current(id);
    const widgetIds = new Set(widgets.map(w => String(w.id)));
    const storeLayoutIds = new Set(storeLayout.map(l => l.i));

    const hasNewWidgets = widgets.some(w => !storeLayoutIds.has(String(w.id)));
    const hasRemovedWidgets = storeLayout.some(l => !widgetIds.has(l.i));
    const storeIsEmpty = storeLayout.length === 0;

    if (hasNewWidgets || hasRemovedWidgets || storeIsEmpty) {
      const newLayout = widgets.map((widget) => {
        const existingItem = storeLayout.find(l => l.i === String(widget.id));
        return existingItem || {
          i: String(widget.id),
          x: widget.position?.x ?? 0,
          y: widget.position?.y ?? 0,
          w: widget.position?.w ?? 2,
          h: widget.position?.h ?? 1,
        };
      });
      const sanitized = sanitizeLayout(newLayout);
      const compacted = compactLayout(sanitized, DEFAULT_COLS);
      setLocalLayout(compacted);
      setLayoutRef.current(id, compacted);
    }
    layoutSyncedRef.current = true;
  }, [id, widgets, isLoading]);

  // 通过 RAF 节流的 ResizeObserver 网格配置更新
  useEffect(() => {
    const updateGridConfig = () => {
      if (gridContainerRef.current) {
        const containerWidth = gridContainerRef.current.getBoundingClientRect().width;
        const colWidth = Math.floor((containerWidth - (DEFAULT_COLS - 1) * GRID_MARGIN[0]) / DEFAULT_COLS);
        setGridConfig({ cols: DEFAULT_COLS, colWidth });
      }
    };

    let rafId = null;
    const rafUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateGridConfig();
        rafId = null;
      });
    };

    rafUpdate();
    const resizeObserver = new ResizeObserver(rafUpdate);
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }
    return () => {
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // 回到顶部按钮可见性
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    setShowScrollTop(el.scrollTop > 200);
    const onScroll = () => setShowScrollTop(el.scrollTop > 200);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [widgets, id]);

  const handleLayoutChange = useCallback((newLayout) => {
    if (!isUserDragging.current) return;
    const sanitized = sanitizeLayout(newLayout);
    const compacted = compactLayout(sanitized, DEFAULT_COLS);
    setLocalLayout(compacted);
    storeSetLayout(id, compacted);
  }, [id, storeSetLayout]);

  const persistLayout = (newLayout) => {
    const sanitized = sanitizeLayout(newLayout);
    const compacted = compactLayout(sanitized, DEFAULT_COLS);
    storeSetLayout(id, compacted);
    setLocalLayout(compacted);
    const positions = compacted.map((l) => ({
      id: parseInt(l.i),
      position: { x: l.x, y: l.y, w: l.w, h: l.h },
    }));
    dashboardsAPI.update(id, { widgets: positions });
  };

  const handleDeleteWidget = useCallback((widget) => {
    addToTrash(widget, id);
    deleteWidgetMutation.mutate(widget.id);
    toast.showSuccess(`"${widget.title}" 已移至操作记录`);
  }, [id, addToTrash, deleteWidgetMutation, toast]);

  const handleModalSuccess = useCallback(() => {
    closeModal();
    queryClient.invalidateQueries(queryKeys.dashboard(id));
    queryClient.invalidateQueries(['widgetBatch']);
    queryClient.invalidateQueries(['metricData']);
  }, [id, queryClient, closeModal]);

  const handleUnsavedChanges = useCallback((data) => {
    const entityId = data.widget?.id || `new-${Date.now()}`;
    const entityName = data.formData?.title || data.widget?.title || '未命名图表';
    addDraft('widget', entityId, entityName, data.formData, { dashboardId: id, dashboardName: dashboard?.name });
    closeModal();
  }, [id, dashboard, addDraft, closeModal]);

  const handleScrollToTop = useCallback(() => {
    gridContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 记忆化模态框键值，确保正确重新渲染
  const modalKey = useMemo(() => {
    if (editingWidget) {
      return `${editingWidget.id}-${editCounterRef.current}`;
    }
    return restoredFormData ? 'draft-restore' : 'new';
  }, [editingWidget, restoredFormData]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ color: 'error.main', mb: 2 }}>
            <Icon name="warning" size={64} />
          </Box>
          <Typography variant="h6">无法加载仪表盘</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {error.message}
          </Typography>
          <Button onClick={() => window.location.href = '/dashboards'} variant="contained">
            返回仪表盘列表
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={gridContainerRef}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        p: 0.5,
      }}
      onClick={() => setSelectedWidgetId(null)}
    >
      {widgets.length === 0 ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
          <Icon name="layoutGrid" size={48} sx={{ mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>暂无图表</Typography>
          <Typography variant="body2" color="text.secondary">点击下方按钮添加第一个图表</Typography>
        </Box>
      ) : (
        <ResponsiveGridLayout
            className="layout"
            layout={layout}
            cols={gridConfig.cols}
            rowHeight={gridConfig.colWidth}
            onLayoutChange={handleLayoutChange}
            onDragStart={() => { isUserDragging.current = true; }}
            onDragStop={(newLayout) => {
              isUserDragging.current = false;
              persistLayout(newLayout);
            }}
            onResizeStart={() => { isUserDragging.current = true; setIsResizing(true); }}
            onResize={(newLayout) => {
              setLocalLayout(sanitizeLayout(newLayout));
            }}
            onResizeStop={(newLayout) => {
              isUserDragging.current = false;
              setIsResizing(false);
              persistLayout(newLayout);
            }}
            draggableHandle=".drag-handle"
            isDraggable={true}
            isResizable={true}
            compactType={null}
            preventCollision={false}
            isBounded={true}
            margin={GRID_MARGIN}
          >
            {widgets.map((widget) => {
              const currentLayout = layout.find(l => l.i === String(widget.id));
              return (
                <div key={String(widget.id)}>
                  <ErrorBoundary
                    context={`Widget #${widget.id}${widget.title ? ` (${widget.title})` : ''}`}
                    widgetInfo={`Widget: #${widget.id} ${widget.title || ''}\nDashboard: ${id}\nConfig: ${JSON.stringify(widget.config || {})}\nMetric IDs: ${JSON.stringify(widget.metric_ids || [])}`}
                    onConfigUndo={handleConfigUndo}
                  >
                    <ChartWidget
                      widget={widget}
                      layoutSize={currentLayout ? { w: currentLayout.w, h: currentLayout.h } : null}
                      isResizing={isResizing}
                      isSelected={selectedWidgetId === widget.id}
                      onSelect={() => setSelectedWidgetId(widget.id)}
                      onEdit={() => openEditModal(widget)}
                      dashboardId={id}
                      prefetchedData={prefetchedData}
                    />
                  </ErrorBoundary>
                </div>
              );
            })}
          </ResponsiveGridLayout>
      )}

      {/* 浮动操作按钮 */}
      {showScrollTop && (
        <Tooltip title="回到顶部">
          <Fab
            color="secondary"
            aria-label="回到顶部"
            sx={{ position: 'fixed', bottom: 88, right: 24, zIndex: 1200 }}
            onClick={handleScrollToTop}
          >
            <Icon name="chevronUp" size={24} />
          </Fab>
        </Tooltip>
      )}
      <Tooltip title="添加图表">
        <Fab
          color="primary"
          aria-label="添加图表"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          onClick={() => openAddModal()}
        >
          <Icon name="plus" size={24} />
        </Fab>
      </Tooltip>

      <Suspense fallback={null}>
        <AddWidgetModal
          key={modalKey}
          dashboardId={id}
          widget={editingWidget}
          isOpen={modalOpen}
          onClose={closeModal}
          onAdd={handleModalSuccess}
          onDelete={() => editingWidget && handleDeleteWidget(editingWidget)}
          onUnsavedChanges={handleUnsavedChanges}
          restoredFormData={restoredFormData}
        />
      </Suspense>
    </Box>
  );
}