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
import { expect, test, vi } from "vitest";
import App from "@/views/App";

vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/PageTransition", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useShortcut", () => ({ useShortcutWithHelp: vi.fn() }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: false }),
}));
vi.mock("@/store/helpModal", () => ({
  useHelpModalStore: (
    selector: (state: Record<string, () => void>) => unknown,
  ) => selector({ open: vi.fn(), toggleHelp: vi.fn(), close: vi.fn() }),
}));
vi.mock("@/pages/Home", () => ({
  default: () => {
    throw new Error("page boom");
  },
}));

test("wraps routed pages with a visible error boundary", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("页面加载失败");
    expect(screen.getByText("page boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});
