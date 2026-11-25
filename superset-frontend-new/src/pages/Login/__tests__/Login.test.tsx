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
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";
import { useAuthStore } from "@/store/authStore";
import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const mockLogin = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
    const state = { login: mockLogin };
    return selector ? selector(state) : state;
  });
  window.location.href = "";
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

test("renders login form", () => {
  renderLogin();
  expect(screen.getByText("starfly")).toBeInTheDocument();
  expect(screen.getByText("登录以继续")).toBeInTheDocument();
  expect(screen.getByLabelText("用户名")).toBeInTheDocument();
  expect(screen.getByLabelText("密码")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
});

test("shows error on failed login", async () => {
  mockLogin.mockRejectedValue(new Error("Invalid credentials"));
  renderLogin();

  userEvent.type(screen.getByLabelText("用户名"), "admin");
  userEvent.type(screen.getByLabelText("密码"), "wrong");
  userEvent.click(screen.getByRole("button", { name: "登录" }));

  expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
});

test("navigates to home on successful login", async () => {
  mockLogin.mockResolvedValue(undefined);
  renderLogin();

  userEvent.type(screen.getByLabelText("用户名"), "admin");
  userEvent.type(screen.getByLabelText("密码"), "pass");
  userEvent.click(screen.getByRole("button", { name: "登录" }));

  await screen.findByText("登录");
  expect(window.location.href).toBe("http://localhost:3000/");
});

test("keeps the password visibility toggle keyboard accessible", () => {
  renderLogin();
  const password = screen.getByLabelText("密码");
  const toggle = screen.getByRole("button", { name: "显示密码" });

  expect(toggle).toHaveAttribute("tabindex", "0");
  password.focus();
  userEvent.tab();
  expect(document.activeElement).toBe(toggle);
  userEvent.click(toggle);
  expect(password).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("renders with username autoFocus", () => {
  renderLogin();
  const usernameInput = screen.getByLabelText("用户名");
  expect(document.activeElement).toBe(usernameInput);
});
