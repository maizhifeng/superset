import type { ReactNode } from "react";
import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useNavStore } from "@/store/navStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useAuthStore } from "@/store/authStore";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { useNavManager } from "@/components/AppLayout/useNavManager";

const { mockFetchNavItems } = vi.hoisted(() => ({
  mockFetchNavItems: vi.fn(),
}));

vi.mock("@/utils/fetchNavItems", () => ({
  fetchNavItems: mockFetchNavItems,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

beforeEach(() => {
  mockFetchNavItems.mockReset();
  mockFetchNavItems.mockResolvedValue([
    { id: 1, label: "db-1" },
    { id: 2, label: "db-2" },
  ]);
  useNavStore.setState({
    activeCategory: null,
    sidePanelOpen: false,
    sidePanelPinned: false,
    sidePanelItems: [],
    sidePanelLoading: false,
    activeOverlay: null,
    backgroundDashboardId: null,
  });
  useMenuSettings.setState({
    items: [
      {
        id: "database/list",
        path: "/database/list",
        label: "数据库",
        builtIn: true,
      },
      { id: "sqllab", path: "/sqllab", label: "SQL 实验室", builtIn: true },
    ],
    enabled: { "database/list": true, sqllab: true },
  });
  useAuthStore.setState({
    user: { username: "admin", roles: { Admin: true } },
  });
  useUserRouteOverrides.setState({ overrides: {} });
});

test("clicking list route keeps pinned panel open and switches category", async () => {
  const { result } = renderHook(() => useNavManager(), { wrapper });
  useNavStore.setState({ sidePanelPinned: true });

  await act(async () => {
    await result.current.handleActivitySelect("database/list");
  });

  const state = useNavStore.getState();
  expect(state.sidePanelPinned).toBe(true);
  expect(state.sidePanelOpen).toBe(true);
  expect(state.activeCategory).toBe("database");
});

test("clicking list route while pinned on same category keeps panel open", async () => {
  const { result } = renderHook(() => useNavManager(), { wrapper });
  useNavStore.setState({
    sidePanelPinned: true,
    sidePanelOpen: true,
    activeCategory: "database",
  });

  await act(async () => {
    await result.current.handleActivitySelect("database/list");
  });

  const state = useNavStore.getState();
  expect(state.sidePanelOpen).toBe(true);
  expect(state.activeCategory).toBe("database");
  expect(mockFetchNavItems).not.toHaveBeenCalled();
});

test("clicking list route while unpinned closes panel", async () => {
  const { result } = renderHook(() => useNavManager(), { wrapper });

  await act(async () => {
    await result.current.handleActivitySelect("database/list");
  });

  const state = useNavStore.getState();
  expect(state.sidePanelOpen).toBe(false);
  expect(state.sidePanelPinned).toBe(false);
});

test("clicking non-mapped route keeps pinned panel open", async () => {
  const { result } = renderHook(() => useNavManager(), { wrapper });
  useNavStore.setState({ sidePanelPinned: true, sidePanelOpen: true });

  await act(async () => {
    await result.current.handleActivitySelect("sqllab");
  });

  expect(useNavStore.getState().sidePanelOpen).toBe(true);
});

test("per-user deny hides a menu entry without role requirements", () => {
  useUserRouteOverrides.setState({
    overrides: { admin: { "/database/list": false } },
  });

  const { result } = renderHook(() => useNavManager(), { wrapper });

  expect(result.current.activityBarItems.map((item) => item.id)).not.toContain(
    "database/list",
  );
});

test("per-user grant shows a role-restricted menu entry", () => {
  useMenuSettings.setState({
    items: [
      {
        id: "project_config",
        path: "/project/settings",
        label: "项目配置",
        builtIn: true,
        roles: ["Admin"],
      },
    ],
    enabled: { project_config: true },
  });
  useAuthStore.setState({ user: { username: "admin", roles: {} } });
  useUserRouteOverrides.setState({
    overrides: { admin: { "/project/settings": true } },
  });

  const { result } = renderHook(() => useNavManager(), { wrapper });

  expect(result.current.activityBarItems.map((item) => item.id)).toContain(
    "project_config",
  );
});

test("per-user deny hides the fixed system admin entry for admins", () => {
  useUserRouteOverrides.setState({
    overrides: { admin: { "/system/admin": false } },
  });

  const { result } = renderHook(() => useNavManager(), { wrapper });

  expect(result.current.activityBarItems.map((item) => item.id)).not.toContain(
    "system_admin",
  );
});
