/*
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
import { test, expect, vi } from "vitest";
import MobileDrawer from "@/components/AppLayout/MobileDrawer";

test("provides direct mobile navigation and closes after logout", () => {
  const onClose = vi.fn();
  const onLogout = vi.fn();
  render(
    <MemoryRouter>
      <MobileDrawer
        open
        onClose={onClose}
        items={[
          { id: "home", label: "首页", path: "/" },
          { id: "charts", label: "图表", path: "/chart/list" },
        ]}
        enabled={{ home: true, charts: true }}
        isActive={(path) => path === "/chart/list"}
        username="admin"
        onLogout={onLogout}
      />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole("navigation", { name: "移动端导航" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute(
    "href",
    "/",
  );
  userEvent.click(screen.getByRole("link", { name: "图表" }));
  expect(onClose).toHaveBeenCalledTimes(1);

  userEvent.click(screen.getByRole("button", { name: "退出登录" }));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onLogout).toHaveBeenCalledTimes(1);
});
