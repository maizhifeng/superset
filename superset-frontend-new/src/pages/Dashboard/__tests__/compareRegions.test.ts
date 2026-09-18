import { test, expect } from "vitest";
import {
  cchValueRegion,
  narrowByRegion,
  narrowMediaByKnownValues,
} from "@/pages/Dashboard/compareRegions";

test("cchValueRegion reads domestic 渠道商[ID] values from their numeric suffix", () => {
  expect(cchValueRegion("官网Appstore [222]")).toBe("domestic");
  expect(cchValueRegion(" 微信小游戏 [392] ")).toBe("domestic");
});

test("cchValueRegion treats bare system names as oversea channels", () => {
  for (const system of ["ios", "android", "third", "windows", "all"]) {
    expect(cchValueRegion(system)).toBe("oversea");
  }
});

test("narrowByRegion keeps only the channels of the game's region", () => {
  const selected = ["官网Appstore [222]", "ios", "微信小游戏 [392]", "android"];
  expect(narrowByRegion(selected, "domestic", cchValueRegion)).toEqual([
    "官网Appstore [222]",
    "微信小游戏 [392]",
  ]);
  expect(narrowByRegion(selected, "oversea", cchValueRegion)).toEqual([
    "ios",
    "android",
  ]);
});

test("narrowByRegion returns null when nothing matches, and [] when unfiltered", () => {
  // 国内游戏 + 只选了海外渠道：没有可用组合
  expect(narrowByRegion(["ios"], "domestic", cchValueRegion)).toBeNull();
  // 没选渠道：不加过滤，而不是查不到
  expect(narrowByRegion([], "domestic", cchValueRegion)).toEqual([]);
});

test("narrowMediaByKnownValues intersects the selection with the game's media", () => {
  const known = new Set(["Applovin", "BIGO"]);
  expect(
    narrowMediaByKnownValues(["Applovin", "抖音小游戏"], known),
  ).toEqual(["Applovin"]);
  expect(narrowMediaByKnownValues(["抖音小游戏"], known)).toBeNull();
});

test("narrowMediaByKnownValues keeps the selection when the lookup is unavailable", () => {
  expect(narrowMediaByKnownValues(["抖音小游戏"], null)).toEqual([
    "抖音小游戏",
  ]);
  expect(narrowMediaByKnownValues([], null)).toEqual([]);
});
