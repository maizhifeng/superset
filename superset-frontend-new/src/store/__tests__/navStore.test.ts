import { test, expect, beforeEach, vi } from "vitest";
import { useNavStore } from "@/store/navStore";

vi.mock("@/utils/fetchNavItems", () => ({
  fetchNavItems: vi.fn((cat: string) =>
    Promise.resolve([
      { id: 1, label: `${cat}-1` },
      { id: 2, label: `${cat}-2` },
    ]),
  ),
}));

beforeEach(() => {
  useNavStore.setState({
    activeCategory: null,
    sidePanelOpen: false,
    sidePanelPinned: false,
    sidePanelItems: [],
    sidePanelLoading: false,
    activeOverlay: null,
    backgroundDashboardId: null,
  });
});

test("closeSidePanel keeps pin state", () => {
  useNavStore.setState({
    sidePanelOpen: true,
    sidePanelPinned: true,
    activeCategory: "dashboard",
  });
  useNavStore.getState().closeSidePanel();
  const state = useNavStore.getState();
  expect(state.sidePanelOpen).toBe(false);
  expect(state.activeCategory).toBeNull();
  expect(state.sidePanelPinned).toBe(true);
});

test("closeSidePanel from unpinned stays unpinned", () => {
  useNavStore.setState({
    sidePanelOpen: true,
    activeCategory: "dashboard",
  });
  useNavStore.getState().closeSidePanel();
  expect(useNavStore.getState().sidePanelPinned).toBe(false);
});

test("toggleCategory opens panel and loads items", async () => {
  await useNavStore.getState().toggleCategory("dashboard");
  const state = useNavStore.getState();
  expect(state.sidePanelOpen).toBe(true);
  expect(state.activeCategory).toBe("dashboard");
  expect(state.sidePanelItems).toEqual([
    { id: 1, label: "dashboard-1" },
    { id: 2, label: "dashboard-2" },
  ]);
});

test("toggleCategory on same open category closes panel", async () => {
  await useNavStore.getState().toggleCategory("dashboard");
  await useNavStore.getState().toggleCategory("dashboard");
  expect(useNavStore.getState().sidePanelOpen).toBe(false);
  expect(useNavStore.getState().activeCategory).toBeNull();
});

test("togglePinSidePanel toggles pinned state", async () => {
  await useNavStore.getState().toggleCategory("dashboard");
  useNavStore.getState().togglePinSidePanel();
  expect(useNavStore.getState().sidePanelPinned).toBe(true);
  useNavStore.getState().togglePinSidePanel();
  expect(useNavStore.getState().sidePanelPinned).toBe(false);
});
