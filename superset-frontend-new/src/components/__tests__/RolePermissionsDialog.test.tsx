import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, test, expect, beforeEach } from "vitest";
import { RolePermissionsContent } from "@/components/RolePermissionsDialog";

// Mock the api used by fetchPermissionViews / fetchRolePermissionIds.
const mockGet = vi.fn();
vi.mock("@/api", () => ({ default: { get: (...a: unknown[]) => mockGet(...a) } }));

const permissionViews = [
  { id: 10, permission: { name: "can_read" }, view_menu: { name: "Chart" } },
  { id: 11, permission: { name: "can_write" }, view_menu: { name: "Dashboard" } },
  { id: 12, permission: { name: "can_read" }, view_menu: { name: "Dataset" } },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation(async (url: string) => {
    if (url.includes("permissions-resources")) {
      return {
        data: { result: permissionViews, count: permissionViews.length },
      };
    }
    if (url.includes("roles/search")) {
      return {
        data: {
          result: [{ id: 1, name: "TestRole", permission_ids: [10, 11, 12] }],
        },
      };
    }
    return { data: { result: [] } };
  });
});

test("renders a permission search box and filters by text", async () => {
  render(<RolePermissionsContent role={{ id: 1, name: "TestRole" }} />);
  const input = await screen.findByPlaceholderText("搜索权限...");
  expect(screen.getAllByText("can_read").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("can_write")).toBeInTheDocument();
  // searching the permission name keeps only that item
  act(() => {
    fireEvent.change(input, { target: { value: "can_write" } });
  });
  expect(screen.getByText("can_write")).toBeInTheDocument();
  // a non-matching term shows the empty notice
  act(() => {
    fireEvent.change(input, { target: { value: "zzz" } });
  });
  await screen.findByText("没有匹配的权限");
});
