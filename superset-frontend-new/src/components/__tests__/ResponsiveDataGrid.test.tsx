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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test, expect, vi } from "vitest";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual("@mui/material");
  return { ...actual, useMediaQuery: () => true };
});

test("offers a visible keyboard-accessible delete action", async () => {
  const onDelete = vi.fn();
  render(
    <ResponsiveDataGrid
      rows={[{ id: 1, name: "图表一" }]}
      columns={[{ field: "name", headerName: "名称" }]}
      renderCard={(row) => <span>{row.name}</span>}
      onDelete={onDelete}
    />,
  );

  userEvent.click(screen.getByRole("button", { name: "删除第 1 项" }));

  await waitFor(() =>
    expect(onDelete).toHaveBeenCalledWith({ id: 1, name: "图表一" }),
  );
});

test("activates a mobile card with Enter", () => {
  const onSelectionChange = vi.fn();
  render(
    <ResponsiveDataGrid
      rows={[{ id: 1, name: "图表一" }]}
      columns={[]}
      selectedIds={["1"]}
      onSelectionChange={onSelectionChange}
      renderCard={(row) => <span>{row.name}</span>}
    />,
  );

  fireEvent.keyDown(screen.getByRole("button", { name: "第 1 项" }), {
    key: "Enter",
  });

  expect(onSelectionChange).toHaveBeenCalledWith([]);
});

test("activates a mobile card with Space", () => {
  const onSelectionChange = vi.fn();
  render(
    <ResponsiveDataGrid
      rows={[{ id: 1, name: "图表一" }]}
      columns={[]}
      selectedIds={[]}
      onSelectionChange={onSelectionChange}
      onDelete={vi.fn()}
      renderCard={(row) => <span>{row.name}</span>}
    />,
  );

  fireEvent.keyDown(screen.getByRole("button", { name: "第 1 项" }), {
    key: " ",
  });

  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "删除第 1 项" })).toHaveAttribute(
    "tabindex",
    "0",
  );
});

test("changes mobile pagination through the typed grid callback", () => {
  const onPaginationModelChange = vi.fn();
  render(
    <ResponsiveDataGrid
      rows={[{ id: 1, name: "图表一" }]}
      columns={[]}
      rowCount={60}
      paginationModel={{ page: 0, pageSize: 25 }}
      onPaginationModelChange={onPaginationModelChange}
      renderCard={(row) => <span>{row.name}</span>}
    />,
  );

  userEvent.click(screen.getByRole("button", { name: "Go to page 2" }));

  expect(onPaginationModelChange).toHaveBeenCalledWith(
    { page: 1, pageSize: 25 },
    expect.objectContaining({ reason: "setPaginationModel" }),
  );
});
