import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDashboardStore, useTrashStore, useMetricStore, useDBStore, useOperationLogStore, useDashboardLayoutStore } from '../store';

// Mock localStorage and sessionStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

global.localStorage = localStorageMock;
global.sessionStorage = sessionStorageMock;

describe('useDashboardStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDashboardStore.setState({
      dashboards: [],
      selectedDashboard: null,
      widgets: [],
      editMode: false,
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [],
      },
    });
  });

  it('should have initial state', () => {
    const state = useDashboardStore.getState();
    expect(state.editMode).toBe(false);
    expect(state.dashboards).toEqual([]);
    expect(state.globalFilters.permanent.dateRange).toBeDefined();
  });

  it('should toggle edit mode', () => {
    const store = useDashboardStore.getState();
    expect(store.editMode).toBe(false);

    store.toggleEditMode();
    expect(useDashboardStore.getState().editMode).toBe(true);

    useDashboardStore.getState().toggleEditMode();
    expect(useDashboardStore.getState().editMode).toBe(false);
  });

  it('should set edit mode explicitly', () => {
    const store = useDashboardStore.getState();
    store.setEditMode(true);
    expect(useDashboardStore.getState().editMode).toBe(true);

    useDashboardStore.getState().setEditMode(false);
    expect(useDashboardStore.getState().editMode).toBe(false);
  });

  it('should set dashboards', () => {
    const dashboards = [
      { id: 1, name: 'Dashboard 1' },
      { id: 2, name: 'Dashboard 2' },
    ];
    useDashboardStore.getState().setDashboards(dashboards);
    expect(useDashboardStore.getState().dashboards).toEqual(dashboards);
  });

  it('should set selected dashboard with widgets', () => {
    const dashboard = { id: 1, name: 'Test Dashboard', widgets: [{ id: 1 }] };
    useDashboardStore.getState().setSelectedDashboard(dashboard);

    const state = useDashboardStore.getState();
    expect(state.selectedDashboard).toEqual(dashboard);
    expect(state.widgets).toEqual([{ id: 1 }]);
  });

  it('should set global filters (legacy)', () => {
    useDashboardStore.getState().setGlobalFilters({ platform: 'ios' });
    const { active } = useDashboardStore.getState().globalFilters;
    expect(active.find(f => f.filterId === 'platform')?.values).toContain('ios');
  });

  it('should merge global filters (legacy)', () => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [{ filterId: 'platform', values: ['android'], field: 'platform', operator: '=' }],
      },
    });

    useDashboardStore.getState().setGlobalFilters({ platform: 'ios' });

    const state = useDashboardStore.getState();
    const platformFilter = state.globalFilters.active.find(f => f.filterId === 'platform');
    expect(platformFilter?.values).toContain('ios');
    expect(state.globalFilters.permanent.dateRange).toEqual({ start: '2024-01-01', end: '2024-01-07' });
  });

  it('should reset global filters', () => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-05' } },
        active: [{ filterId: 'platform', values: ['ios'], field: 'platform', operator: '=' }],
      },
    });

    useDashboardStore.getState().resetGlobalFilters();

    const state = useDashboardStore.getState();
    expect(state.globalFilters.permanent.dateRange.start).toBeDefined();
    expect(state.globalFilters.permanent.dateRange.end).toBeDefined();
    expect(state.globalFilters.active.find(f => f.filterId === 'platform')?.values).toEqual([]);
  });
});

describe('useDashboardLayoutStore', () => {
  beforeEach(() => {
    useDashboardLayoutStore.setState({
      layouts: {},
      initialized: {},
    });
  });

  it('should get layout for dashboard', () => {
    const layout = [{ i: '1', x: 0, y: 0, w: 2, h: 1 }];
    useDashboardLayoutStore.getState().setLayout('dashboard-1', layout);

    const retrieved = useDashboardLayoutStore.getState().getLayout('dashboard-1');
    expect(retrieved).toEqual(layout);
  });

  it('should return empty array for unknown dashboard', () => {
    const layout = useDashboardLayoutStore.getState().getLayout('unknown');
    expect(layout).toEqual([]);
  });

  it('should update single layout item', () => {
    const layout = [{ i: '1', x: 0, y: 0, w: 2, h: 1 }];
    useDashboardLayoutStore.getState().setLayout('dashboard-1', layout);

    useDashboardLayoutStore.getState().updateLayoutItem('dashboard-1', '1', { w: 4, h: 2 });

    const updated = useDashboardLayoutStore.getState().getLayout('dashboard-1');
    expect(updated[0].w).toBe(4);
    expect(updated[0].h).toBe(2);
  });

  it('should clear layout', () => {
    const layout = [{ i: '1', x: 0, y: 0, w: 2, h: 1 }];
    useDashboardLayoutStore.getState().setLayout('dashboard-1', layout);
    useDashboardLayoutStore.getState().setInitialized('dashboard-1', true);

    useDashboardLayoutStore.getState().clearLayout('dashboard-1');

    expect(useDashboardLayoutStore.getState().getLayout('dashboard-1')).toEqual([]);
    expect(useDashboardLayoutStore.getState().isInitialized('dashboard-1')).toBe(false);
  });
});

describe('useTrashStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    useTrashStore.setState({ trashItems: [] });
    useOperationLogStore.setState({ items: [] });
  });

  it('should add widget to trash', () => {
    const widget = { id: 1, title: 'Test Widget' };
    useTrashStore.getState().addToTrash(widget, 1);

    const state = useTrashStore.getState();
    expect(state.trashItems.length).toBe(1);
  });

  it('should restore widget from trash', () => {
    const widget = { id: 1, title: 'Test Widget' };
    useTrashStore.getState().addToTrash(widget, 1);

    // Get the operation log item ID
    const logItems = useOperationLogStore.getState().getByType('widget');
    const trashId = logItems.find(i => i.status === 'deleted')?.id;

    if (trashId) {
      const restored = useTrashStore.getState().restoreFromTrash(trashId);
      expect(restored).toBeDefined();
      expect(restored?.widget).toEqual(widget);
      expect(restored?.dashboardId).toBe(1);
    }
  });

  it('should return null for non-existent trash item', () => {
    const restored = useTrashStore.getState().restoreFromTrash('non-existent');
    expect(restored).toBeNull();
  });

  it('should remove from trash permanently', () => {
    const widget = { id: 1, title: 'Test Widget' };
    useTrashStore.getState().addToTrash(widget, 1);

    const logItems = useOperationLogStore.getState().getByType('widget');
    const trashId = logItems.find(i => i.status === 'deleted')?.id;

    if (trashId) {
      useTrashStore.getState().removeFromTrash(trashId);
      expect(useTrashStore.getState().trashItems.length).toBe(0);
    }
  });

  it('should clear all trash', () => {
    useTrashStore.getState().addToTrash({ id: 1 }, 1);
    useTrashStore.getState().addToTrash({ id: 2 }, 1);

    useTrashStore.getState().clearTrash();

    expect(useTrashStore.getState().trashItems.length).toBe(0);
  });

  it('should get trash by dashboard', () => {
    useTrashStore.getState().addToTrash({ id: 1 }, 1);
    useTrashStore.getState().addToTrash({ id: 2 }, 2);
    useTrashStore.getState().addToTrash({ id: 3 }, 1);

    const dashboard1Trash = useTrashStore.getState().getTrashByDashboard(1);
    expect(dashboard1Trash.length).toBe(2);
  });
});

describe('useOperationLogStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    useOperationLogStore.setState({ items: [] });
  });

  it('should add deleted item', () => {
    const id = useOperationLogStore.getState().addDeleted('widget', 1, 'Test Widget', { id: 1 }, { dashboardId: 1 });
    expect(id).toBeDefined();

    const items = useOperationLogStore.getState().getByStatus('deleted');
    expect(items.length).toBe(1);
    expect(items[0].entityType).toBe('widget');
    expect(items[0].status).toBe('deleted');
  });

  it('should add draft item', () => {
    const id = useOperationLogStore.getState().addDraft('widget', 'new', 'Draft Widget', { title: 'Test' });
    expect(id).toBeDefined();

    const items = useOperationLogStore.getState().getByStatus('draft');
    expect(items.length).toBe(1);
    expect(items[0].status).toBe('draft');
  });

  it('should remove item', () => {
    const id = useOperationLogStore.getState().addDeleted('widget', 1, 'Test', {});
    useOperationLogStore.getState().remove(id);

    const items = useOperationLogStore.getState().items;
    expect(items.length).toBe(0);
  });

  it('should get count by status', () => {
    useOperationLogStore.getState().addDeleted('widget', 1, 'Test 1', {});
    useOperationLogStore.getState().addDeleted('widget', 2, 'Test 2', {});
    useOperationLogStore.getState().addDraft('widget', 'new', 'Draft', {});

    expect(useOperationLogStore.getState().getCount('deleted')).toBe(2);
    expect(useOperationLogStore.getState().getCount('draft')).toBe(1);
  });

  it('should check for drafts', () => {
    expect(useOperationLogStore.getState().hasDrafts()).toBe(false);

    useOperationLogStore.getState().addDraft('widget', 'new', 'Draft', {});
    expect(useOperationLogStore.getState().hasDrafts()).toBe(true);
  });

  it('should get entity config', () => {
    const config = useOperationLogStore.getState().getEntityConfig('widget');
    expect(config).toBeDefined();
    expect(config.icon).toBe('chart');
    expect(config.name).toBe('图表');
  });
});

describe('useMetricStore', () => {
  beforeEach(() => {
    useMetricStore.setState({
      metrics: [],
      selectedMetric: null,
      currentConfig: null,
      previewSQL: '',
      previewData: null,
    });
  });

  it('should set metrics', () => {
    const metrics = [{ id: 1, name: 'Metric 1' }];
    useMetricStore.getState().setMetrics(metrics);
    expect(useMetricStore.getState().metrics).toEqual(metrics);
  });

  it('should set selected metric', () => {
    const metric = { id: 1, name: 'Test Metric' };
    useMetricStore.getState().setSelectedMetric(metric);
    expect(useMetricStore.getState().selectedMetric).toEqual(metric);
  });

  it('should set preview SQL', () => {
    useMetricStore.getState().setPreviewSQL('SELECT * FROM table');
    expect(useMetricStore.getState().previewSQL).toBe('SELECT * FROM table');
  });
});

describe('useDBStore', () => {
  beforeEach(() => {
    useDBStore.setState({
      connected: false,
      config: null,
      tables: [],
      selectedTable: null,
      columns: [],
    });
  });

  it('should set connected state', () => {
    const config = { host: 'localhost' };
    useDBStore.getState().setConnected(true, config);

    const state = useDBStore.getState();
    expect(state.connected).toBe(true);
    expect(state.config).toEqual(config);
  });

  it('should set tables', () => {
    const tables = [{ table_name: 'users' }, { table_name: 'orders' }];
    useDBStore.getState().setTables(tables);
    expect(useDBStore.getState().tables).toEqual(tables);
  });

  it('should select table with columns', () => {
    const columns = [{ column_name: 'id' }, { column_name: 'name' }];
    useDBStore.getState().selectTable('users', columns);

    const state = useDBStore.getState();
    expect(state.selectedTable).toBe('users');
    expect(state.columns).toEqual(columns);
  });
});