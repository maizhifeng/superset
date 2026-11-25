/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import { CompareModalFilters } from "@/pages/Dashboard/CompareModalFilters";
import type { SelectedGame } from "@/pages/Dashboard/compareModalModel";

const domesticGame: SelectedGame = {
  papp_id: "1",
  region: "domestic",
  papp_name: "游戏A",
  上线时间: "2024/01/01",
};
const overseaGame: SelectedGame = {
  papp_id: "1",
  region: "oversea",
  papp_name: "游戏B",
  上线时间: "2024/02/01",
};

function makeProps(
  overrides: Partial<ComponentProps<typeof CompareModalFilters>> = {},
): ComponentProps<typeof CompareModalFilters> {
  return {
    games: [domesticGame, overseaGame],
    selectedGames: [],
    selectedCchNames: [],
    selectedChannels: [],
    cchNameValues: [],
    channelValues: [],
    primaryGameKey: null,
    inputValue: "",
    cchNameInput: "",
    channelInput: "",
    selectedAnchors: ["上线时间"],
    sectionCount: 1,
    onGamesChange: vi.fn(),
    onPrimaryGameChange: vi.fn(),
    onCchNamesChange: vi.fn(),
    onChannelsChange: vi.fn(),
    onInputValueChange: vi.fn(),
    onCchNameInputChange: vi.fn(),
    onChannelInputChange: vi.fn(),
    ...overrides,
  };
}

test("filters selected games and keeps region in the primary game key", async () => {
  const props = makeProps({ selectedGames: [domesticGame] });
  render(<CompareModalFilters {...props} />);

  const combobox = screen.getByRole("combobox", {
    name: "选择要对比的游戏",
  });
  userEvent.click(combobox);

  const option = await screen.findByRole("option", { name: /游戏B/ });
  expect(option).toHaveTextContent("海外");
  expect(
    within(screen.getByRole("listbox")).queryByRole("option", {
      name: /游戏A/,
    }),
  ).not.toBeInTheDocument();

  userEvent.click(option);
  expect(props.onGamesChange).toHaveBeenCalledWith([domesticGame, overseaGame]);
  expect(props.onPrimaryGameChange).toHaveBeenCalledWith("domestic:1");
});

test("excludes selected channel values from autocomplete options", async () => {
  const props = makeProps({
    selectedGames: [domesticGame],
    selectedCchNames: ["渠道A [1]"],
    cchNameValues: ["渠道A [1]", "渠道B [2]"],
  });
  render(<CompareModalFilters {...props} />);

  userEvent.click(screen.getByRole("combobox", { name: "渠道商[ID]" }));
  const listbox = await screen.findByRole("listbox");
  expect(
    within(listbox).queryByRole("option", { name: "渠道A [1]" }),
  ).not.toBeInTheDocument();
  expect(
    within(listbox).getByRole("option", { name: "渠道B [2]" }),
  ).toBeInTheDocument();
});

test("shows intra-comparison status and the inter-comparison warning", () => {
  const { rerender } = render(
    <CompareModalFilters
      {...makeProps({
        selectedGames: [domesticGame],
        selectedCchNames: ["渠道A [1]"],
      })}
    />,
  );

  expect(screen.getByText("内对比")).toBeInTheDocument();
  expect(screen.getByText("选定为主表，其他为次表")).toBeInTheDocument();

  rerender(
    <CompareModalFilters
      {...makeProps({
        selectedGames: [domesticGame, overseaGame],
        sectionCount: 5,
      })}
    />,
  );

  expect(screen.getByText("维度组合独立分表 (5项)")).toBeInTheDocument();
  expect(screen.getByText(/项目较多，可能影响性能/)).toBeInTheDocument();
});
