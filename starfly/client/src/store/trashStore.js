import { create } from 'zustand';
import { useOperationLogStore } from './operationLogStore';

/**
 * Trash Store - Backward compatibility adapter
 * Delegates to useOperationLogStore for actual operations
 */
export const useTrashStore = create((set, get) => ({
  trashItems: [],

  addToTrash: (widget, dashboardId) => {
    useOperationLogStore.getState().addDeleted(
      'widget',
      widget.id,
      widget.title,
      widget,
      { dashboardId }
    );
    set({ trashItems: useOperationLogStore.getState().getByType('widget').filter(i => i.status === 'deleted') });
  },

  restoreFromTrash: (trashId) => {
    const item = useOperationLogStore.getState().items.find(i => i.id === trashId);
    if (item && item.status === 'deleted') {
      useOperationLogStore.getState().remove(trashId);
      set({ trashItems: useOperationLogStore.getState().getByType('widget').filter(i => i.status === 'deleted') });
      return { widget: item.data, dashboardId: item.context?.dashboardId };
    }
    return null;
  },

  removeFromTrash: (trashId) => {
    useOperationLogStore.getState().remove(trashId);
    set({ trashItems: useOperationLogStore.getState().getByType('widget').filter(i => i.status === 'deleted') });
  },

  clearTrash: () => {
    useOperationLogStore.getState().clearByType('deleted', 'widget');
    set({ trashItems: [] });
  },

  getTrashByDashboard: (dashboardId) =>
    useOperationLogStore.getState().getByDashboard(dashboardId)
      .filter(i => i.status === 'deleted' && i.entityType === 'widget'),
}));
