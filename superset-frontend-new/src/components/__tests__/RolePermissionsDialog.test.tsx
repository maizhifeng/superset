/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, test, expect, beforeEach } from "vitest";
import { RolePermissionsContent } from "@/components/RolePermissionsDialog";

// Mock the api used by fetchPermissionViews / fetchRolePermissionIds.
const mockGet = vi.fn();
vi.mock("@/api", () => ({
  default: { get: (...a: unknown[]) => mockGet(...a) },
}));

const permissionViews = [
  { id: 10, permission: { name: "can_read" }, view_menu: { name: "Chart" } },
  {
    id: 11,
    permission: { name: "can_write" },
    view_menu: { name: "Dashboard" },
  },
  { id: 12, permission: { name: "can_read" }, view_menu: { name: "Dataset" } },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url.includes("permissions-resources")) {
      return Promise.resolve({
        data: { result: permissionViews, count: permissionViews.length },
      });
    }
    if (url.includes("roles/search")) {
      return Promise.resolve({
        data: {
          result: [{ id: 1, name: "TestRole", permission_ids: [10, 11, 12] }],
        },
      });
    }
    return Promise.resolve({ data: { result: [] } });
  });
});

test("shows an error instead of a permanent spinner and clears a rejected role cache", async () => {
  let roleAttempts = 0;
  let viewAttempts = 0;
  mockGet.mockImplementation((url: string) => {
    if (url.includes("permissions-resources")) {
      viewAttempts += 1;
      if (viewAttempts === 1) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({
        data: { result: permissionViews, count: permissionViews.length },
      });
    }
    if (url.includes("roles/search")) {
      roleAttempts += 1;
      if (roleAttempts === 1) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({
        data: {
          result: [{ id: 1, name: "TestRole", permission_ids: [10, 11, 12] }],
        },
      });
    }
    return Promise.resolve({ data: { result: [] } });
  });

  render(<RolePermissionsContent role={{ id: 1, name: "TestRole" }} />);

  expect(await screen.findByText("加载角色权限失败")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "重试" }));

  expect(await screen.findByPlaceholderText("搜索权限...")).toBeInTheDocument();
  expect(roleAttempts).toBe(2);
  expect(viewAttempts).toBe(2);
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
