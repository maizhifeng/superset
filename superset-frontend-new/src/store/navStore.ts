import { create } from "zustand";

export type NavCategory =
  | "dashboard"
  | "chart"
  | "dataset"
  | "saved_query"
  | "sqllab"
  | "settings"
  | "database";

interface NavItem {
  id: number;
  label: string;
}

interface OverlayState {
  type: NavCategory | "sqllab" | "chart-editor";
  id?: number | string;
}

interface NavStore {
  activeCategory: NavCategory | null;
  sidePanelOpen: boolean;
  sidePanelPinned: boolean;
  sidePanelItems: NavItem[];
  sidePanelLoading: boolean;
  activeOverlay: OverlayState | null;
  backgroundDashboardId: number | null;

  toggleCategory: (cat: NavCategory) => Promise<void>;
  closeSidePanel: () => void;
  togglePinSidePanel: () => void;
  openOverlay: (type: OverlayState["type"], id?: number | string) => void;
  closeOverlay: () => void;
  selectDashboard: (id: number) => void;
  setSidePanelItems: (items: NavItem[]) => void;
}

export const useNavStore = create<NavStore>()((set, get) => ({
  activeCategory: null,
  sidePanelOpen: false,
  sidePanelPinned: false,
  sidePanelItems: [],
  sidePanelLoading: false,
  activeOverlay: null,
  backgroundDashboardId: null,

  toggleCategory: async (cat) => {
    const { activeCategory, sidePanelOpen } = get();
    if (activeCategory === cat && sidePanelOpen) {
      set({ sidePanelOpen: false, activeCategory: null });
      return;
    }
    set({ activeCategory: cat, sidePanelOpen: true, sidePanelLoading: true });

    if (cat === "sqllab") {
      set({
        sidePanelItems: [],
        sidePanelLoading: false,
      });
      return;
    }

    if (cat === "settings") {
      set({
        sidePanelItems: [],
        sidePanelLoading: false,
      });
      return;
    }

    try {
      const { fetchNavItems } = await import("@/utils/fetchNavItems");
      const items = await fetchNavItems(cat);
      set({ sidePanelItems: items, sidePanelLoading: false });
    } catch {
      set({ sidePanelItems: [], sidePanelLoading: false });
    }
  },

  closeSidePanel: () => {
    set({ sidePanelOpen: false, activeCategory: null, sidePanelPinned: false });
  },

  togglePinSidePanel: () => {
    const { sidePanelPinned, sidePanelOpen, activeCategory } = get();
    if (sidePanelPinned) {
      set({ sidePanelPinned: false });
    } else if (sidePanelOpen) {
      set({ sidePanelPinned: true });
    } else {
      const cat = activeCategory ?? "dashboard";
      set({
        sidePanelPinned: true,
        activeCategory: cat,
        sidePanelOpen: true,
        sidePanelLoading: true,
      });
      import("@/utils/fetchNavItems")
        .then(({ fetchNavItems }) => fetchNavItems(cat))
        .then((items) =>
          set({ sidePanelItems: items, sidePanelLoading: false }),
        )
        .catch(() => set({ sidePanelItems: [], sidePanelLoading: false }));
    }
  },

  openOverlay: (type, id) => {
    set({ activeOverlay: { type, id } });
  },

  closeOverlay: () => {
    set({ activeOverlay: null });
  },

  selectDashboard: (id) => {
    set({ backgroundDashboardId: id, activeOverlay: null });
  },

  setSidePanelItems: (items) => {
    set({ sidePanelItems: items });
  },
}));
