import { create } from 'zustand';

export const useDBStore = create((set) => ({
  connections: [],
  activeConnection: null,
  connected: false,
  config: null,
  tables: [],
  selectedTable: null,
  columns: [],

  setConnections: (connections) => set({ connections }),
  addConnection: (conn) => set((s) => ({ connections: [...s.connections, conn] })),
  updateConnection: (id, updates) =>
    set((s) => ({
      connections: s.connections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeConnection: (id) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      activeConnection: s.activeConnection?.id === id ? null : s.activeConnection,
    })),
  setActiveConnection: (conn) => set({ activeConnection: conn, connected: !!conn }),
  setConnected: (connected, config) => set({ connected, config }),
  setTables: (tables) => set({ tables }),
  selectTable: (table, columns) => set({ selectedTable: table, columns }),
}));
