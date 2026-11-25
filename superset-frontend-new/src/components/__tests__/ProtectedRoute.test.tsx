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

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { test, expect, beforeEach } from "vitest";

function renderWithRouter(
  ui: React.ReactElement,
  initialEntries: string[] = ["/"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
    loading: false,
    isAuthenticated: false,
  });
  useMenuSettings.setState({ items: [], enabled: {} });
  useUserRouteOverrides.setState({ overrides: {} });
});

test("shows loading spinner when auth is loading", () => {
  useAuthStore.setState({ loading: true });
  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
});

test("redirects to login when not authenticated", () => {
  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
});

test("renders children when authenticated", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.getByText("Protected Content")).toBeInTheDocument();
});

test("shows forbidden page for globally disabled routes", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  useMenuSettings.setState({ items: [], enabled: { dashboards: false } });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/dashboard/list"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});

test("renders children when the matching menu entry is enabled", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  useMenuSettings.setState({ items: [], enabled: { dashboards: true } });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/dashboard/list"],
  );

  expect(screen.getByText("Protected Content")).toBeInTheDocument();
});

test("leaves ungated routes alone regardless of menu switches", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  useMenuSettings.setState({ items: [], enabled: { dashboards: false } });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/"],
  );

  expect(screen.getByText("Protected Content")).toBeInTheDocument();
});

test("global menu switch wins over a per-user route grant", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin", roles: {} },
    isAuthenticated: true,
    loading: false,
  });
  useMenuSettings.setState({ items: [], enabled: { project_config: false } });
  useUserRouteOverrides.setState({
    overrides: { admin: { "/project/settings": true } },
  });

  renderWithRouter(
    <ProtectedRoute requiredRoles={["Admin"]}>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/project/settings"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});

test("per-user deny blocks a route without role requirements", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  useUserRouteOverrides.setState({
    overrides: { admin: { "/briefing": false } },
  });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/briefing"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});

test("per-user deny on a list route also blocks its detail routes", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  useUserRouteOverrides.setState({
    overrides: { admin: { "/dashboard/list": false } },
  });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/dashboard/42"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});

test("per-user grant cannot bypass a role-protected route", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin", roles: {} },
    isAuthenticated: true,
    loading: false,
  });
  useUserRouteOverrides.setState({
    overrides: { admin: { "/project/settings": true } },
  });

  renderWithRouter(
    <ProtectedRoute requiredRoles={["Admin"]}>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/project/settings"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});

test("per-user default still follows role requirements", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin", roles: {} },
    isAuthenticated: true,
    loading: false,
  });

  renderWithRouter(
    <ProtectedRoute requiredRoles={["Admin"]}>
      <div>Protected Content</div>
    </ProtectedRoute>,
    ["/project/settings"],
  );

  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  expect(screen.getByText("权限不足")).toBeInTheDocument();
});
