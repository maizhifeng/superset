import { test, expect } from "vitest";
import {
  anchorSectionLabel,
  buildStartMaps,
  compareSectionOrder,
  hasAnyStart,
  nextAnchor,
  resolveMilestoneDate,
  resolveStartDate,
  resolveStartWindow,
  startKey,
} from "@/pages/Dashboard/compareStartDate";
import type { ProfitSharingStartRow } from "@/pages/Dashboard/compareStartDate";

const rows: ProfitSharingStartRow[] = [
  {
    papp_id: 1,
    channel_name: "A",
    上线时间: "2026/01/10",
    首测起始时间: "2025/12/01",
    二测起始时间: "",
    三测起始时间: "",
  },
  {
    papp_id: 1,
    channel_name: "B",
    上线时间: "2026/02/01",
    首测起始时间: "2025/12/05",
    二测起始时间: "2026/01/05",
    三测起始时间: "",
  },
  {
    papp_id: 2,
    channel_name: "A",
    上线时间: "",
    首测起始时间: "2025/12/20",
    二测起始时间: "",
    三测起始时间: "",
  },
];

test("buildStartMaps keeps the earliest date per game and per-channel dates", () => {
  const maps = buildStartMaps(rows);

  expect(maps["首测起始时间"].global["1"]).toBe("2025/12/01");
  expect(maps["首测起始时间"].perChannel["1"]).toEqual({
    A: "2025/12/01",
    B: "2025/12/05",
  });

  expect(maps["二测起始时间"].global["1"]).toBe("2026/01/05");
  expect(maps["二测起始时间"].perChannel["1"]).toEqual({
    B: "2026/01/05",
  });

  expect(maps["上线时间"].global["1"]).toBe("2026/01/10");
  expect(maps["上线时间"].perChannel["1"]).toEqual({
    A: "2026/01/10",
    B: "2026/02/01",
  });
});

test("buildStartMaps ignores empty dates", () => {
  const maps = buildStartMaps([
    {
      papp_id: 9,
      channel_name: "A",
      上线时间: "",
      首测起始时间: "",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  expect(maps["上线时间"].global["9"]).toBeUndefined();
  expect(hasAnyStart(maps, "9")).toBe(false);
});

test("buildStartMaps compares non-padded dates by date, not string", () => {
  const maps = buildStartMaps([
    {
      papp_id: 7,
      channel_name: "A",
      上线时间: "",
      首测起始时间: "2024/9/20",
      二测起始时间: "",
      三测起始时间: "",
    },
    {
      papp_id: 7,
      channel_name: "B",
      上线时间: "",
      首测起始时间: "2024/10/01",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  expect(maps["首测起始时间"].global["7"]).toBe("2024/9/20");
  expect(maps["首测起始时间"].perChannel["7"]).toEqual({
    A: "2024/9/20",
    B: "2024/10/01",
  });
});

test("buildStartMaps ignores unparseable dates", () => {
  const maps = buildStartMaps([
    {
      papp_id: 8,
      channel_name: "A",
      上线时间: "not-a-date",
      首测起始时间: "",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  expect(maps["上线时间"].global["8"]).toBeUndefined();
  expect(hasAnyStart(maps, "8")).toBe(false);
});

test("resolveStartDate prefers the channel date under the selected anchor", () => {
  const maps = buildStartMaps(rows);
  expect(resolveStartDate(maps, "首测起始时间", "1", "B")).toBe("2025/12/05");
});

test("resolveStartDate falls back to the game-wide anchor date", () => {
  const maps = buildStartMaps(rows);
  // 二测 has no date for channel A, so the game-wide earliest 二测 wins
  expect(resolveStartDate(maps, "二测起始时间", "1", "A")).toBe("2026/01/05");
});

test("resolveStartDate does not fall back test rounds to the launch date", () => {
  const maps = buildStartMaps(rows);
  // 三测 is empty everywhere: no independent section is generated for it
  expect(resolveStartDate(maps, "三测起始时间", "1", "A")).toBeUndefined();
  expect(resolveStartDate(maps, "三测起始时间", "1", "C")).toBeUndefined();
  expect(resolveStartDate(maps, "三测起始时间", "1")).toBeUndefined();
  // 上线时间 still resolves from the launch map
  expect(resolveStartDate(maps, "上线时间", "1", "A")).toBe("2026/01/10");
  expect(resolveStartDate(maps, "上线时间", "1")).toBe("2026/01/10");
});

test("resolveMilestoneDate falls back to the launch date for clamps only", () => {
  const maps = buildStartMaps([
    {
      papp_id: "5",
      channel_name: "A",
      上线时间: "2024/09/01",
      首测起始时间: "2024/04/30",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  expect(resolveMilestoneDate(maps, "二测起始时间", "5")).toBe("2024/09/01");
  expect(resolveMilestoneDate(maps, "三测起始时间", "5")).toBe("2024/09/01");
  expect(resolveMilestoneDate(maps, "上线时间", "5")).toBe("2024/09/01");
  // 该游戏自己的日期优先
  expect(resolveMilestoneDate(maps, "首测起始时间", "5")).toBe("2024/04/30");
});

test("resolveStartDate supports games that only have test-round dates", () => {
  const maps = buildStartMaps(rows);
  expect(resolveStartDate(maps, "上线时间", "2")).toBeUndefined();
  expect(resolveStartDate(maps, "首测起始时间", "2")).toBe("2025/12/20");
  expect(hasAnyStart(maps, "2")).toBe(true);
});

test("resolveStartDate returns undefined when nothing is filled", () => {
  const maps = buildStartMaps(rows);
  expect(resolveStartDate(maps, "三测起始时间", "3")).toBeUndefined();
  expect(hasAnyStart(maps, "3")).toBe(false);
});

test("anchorSectionLabel prefixes the round only when multiple anchors are selected", () => {
  expect(anchorSectionLabel("首测起始时间", "冒险岛", false)).toBe("冒险岛");
  expect(anchorSectionLabel("首测起始时间", "冒险岛", true)).toBe(
    "首测 · 冒险岛",
  );
  expect(anchorSectionLabel("上线时间", "A × B", true)).toBe("上线 · A × B");
});

test("compareSectionOrder sorts by start date regardless of selection order", () => {
  const sections = [
    { start: "2026/05/07", anchor: "二测起始时间" as const, label: "二测" },
    { start: "2026/04/30", anchor: "首测起始时间" as const, label: "首测" },
    { start: "2026/09/02", anchor: "三测起始时间" as const, label: "三测" },
  ];
  expect([...sections].sort(compareSectionOrder).map((s) => s.label)).toEqual([
    "首测",
    "二测",
    "三测",
  ]);
});

test("compareSectionOrder breaks ties by stage order then label", () => {
  const sameDay = [
    { start: "2026/04/30", anchor: "上线时间" as const, label: "上线" },
    { start: "2026/04/30", anchor: "首测起始时间" as const, label: "首测" },
  ];
  expect(sameDay.sort(compareSectionOrder).map((s) => s.label)).toEqual([
    "首测",
    "上线",
  ]);
  const sameStage = [
    { start: "2026/04/30", anchor: "首测起始时间" as const, label: "B 游戏" },
    { start: "2026/04/30", anchor: "首测起始时间" as const, label: "A 游戏" },
  ];
  expect(sameStage.sort(compareSectionOrder).map((s) => s.label)).toEqual([
    "A 游戏",
    "B 游戏",
  ]);
});

test("compareSectionOrder puts sections without a start date last", () => {
  const sections = [
    { start: undefined, anchor: "首测起始时间" as const, label: "无日期" },
    { start: "2026/04/30", anchor: "上线时间" as const, label: "有日期" },
  ];
  expect(sections.sort(compareSectionOrder).map((s) => s.label)).toEqual([
    "有日期",
    "无日期",
  ]);
});

test("nextAnchor follows the 首测 → 二测 → 三测 → 上线 order", () => {
  expect(nextAnchor("首测起始时间")).toBe("二测起始时间");
  expect(nextAnchor("二测起始时间")).toBe("三测起始时间");
  expect(nextAnchor("三测起始时间")).toBe("上线时间");
  expect(nextAnchor("上线时间")).toBeUndefined();
});

const roundRows: ProfitSharingStartRow[] = [
  {
    papp_id: "1",
    channel_name: "A",
    上线时间: "2024/09/01",
    首测起始时间: "2024/04/30",
    二测起始时间: "2024/05/07",
    三测起始时间: "2024/06/01",
  },
];

test("resolveStartWindow caps each round's end at the next round's start (half-open)", () => {
  const maps = buildStartMaps(roundRows);
  // 首测 4/30 + 30 天 = 5/30,被二测 5/7 截断;end 为开区间边界,不含 5/7 当天
  expect(resolveStartWindow(maps, "首测起始时间", "1", 30)).toEqual({
    start: "2024/04/30",
    end: "2024/05/07",
  });
  // 二测 5/7 + 30 天 = 6/6,被三测 6/1 截断
  expect(resolveStartWindow(maps, "二测起始时间", "1", 30)).toEqual({
    start: "2024/05/07",
    end: "2024/06/01",
  });
});

test("resolveStartWindow keeps the period when the next round is far enough", () => {
  const maps = buildStartMaps(roundRows);
  // 三测 6/1 + 30 天 = 7/1,早于上线 9/1,不截断
  expect(resolveStartWindow(maps, "三测起始时间", "1", 30)).toEqual({
    start: "2024/06/01",
    end: "2024/07/01",
  });
  // 上线是最后一个阶段,不截断
  expect(resolveStartWindow(maps, "上线时间", "1", 30)).toEqual({
    start: "2024/09/01",
    end: "2024/10/01",
  });
  // 周期小于到下一轮的距离时不截断
  expect(resolveStartWindow(maps, "首测起始时间", "1", 3)).toEqual({
    start: "2024/04/30",
    end: "2024/05/03",
  });
});

test("resolveStartWindow skips test rounds for games that only have a launch date", () => {
  const maps = buildStartMaps([
    {
      papp_id: "4",
      channel_name: "A",
      上线时间: "2024/03/13",
      首测起始时间: "",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  // 不再把首测/二测/三测按上线时间生成重复标签与分表
  expect(resolveStartWindow(maps, "首测起始时间", "4", 30)).toBeUndefined();
  expect(resolveStartWindow(maps, "二测起始时间", "4", 30)).toBeUndefined();
  expect(resolveStartWindow(maps, "三测起始时间", "4", 30)).toBeUndefined();
  expect(resolveStartWindow(maps, "上线时间", "4", 30)).toEqual({
    start: "2024/03/13",
    end: "2024/04/12",
  });
});

test("resolveStartWindow falls back to the launch date for a missing next round", () => {
  const maps = buildStartMaps([
    {
      papp_id: "3",
      channel_name: "A",
      上线时间: "2024/09/01",
      首测起始时间: "2024/04/30",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);
  // 二测缺失时下一阶段回退到上线时间 9/1,首测窗口 150 天被截断到 9/1
  expect(resolveStartWindow(maps, "首测起始时间", "3", 150)).toEqual({
    start: "2024/04/30",
    end: "2024/09/01",
  });
});

test("startKey separates the same papp_id across regions", () => {
  expect(startKey("domestic", 217)).toBe("domestic:217");
  expect(startKey("oversea", 217)).toBe("oversea:217");
  expect(startKey("domestic", 217)).not.toBe(startKey("oversea", 217));
});

test("startKey falls back to the plain id for rows without a region", () => {
  expect(startKey(undefined, 217)).toBe("217");
});

test("buildStartMaps keeps regions with a colliding papp_id apart", () => {
  const maps = buildStartMaps([
    {
      papp_id: 217,
      region: "domestic",
      channel_name: "A",
      上线时间: "2020/03/25",
      首测起始时间: "",
      二测起始时间: "",
      三测起始时间: "",
    },
    {
      papp_id: 217,
      region: "oversea",
      channel_name: "ios",
      上线时间: "2020/10/10",
      首测起始时间: "",
      二测起始时间: "",
      三测起始时间: "",
    },
  ]);

  expect(resolveStartDate(maps, "上线时间", startKey("domestic", 217))).toBe(
    "2020/03/25",
  );
  expect(resolveStartDate(maps, "上线时间", startKey("oversea", 217))).toBe(
    "2020/10/10",
  );
  // 海外渠道名不会串到国内游戏上
  expect(
    resolveStartDate(maps, "上线时间", startKey("domestic", 217), "ios"),
  ).toBe("2020/03/25");
  expect(hasAnyStart(maps, startKey("oversea", 217))).toBe(true);
  expect(hasAnyStart(maps, startKey("domestic", 999))).toBe(false);
});
