import { test, expect } from "vitest";
import {
  buildViewSummary,
  type SummaryParagraph,
} from "@/pages/Analysis/summary";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";
import type { AnalysisAnomaly, DrillAnomaly } from "@/pages/Analysis/anomalies";

const cost = getAnalysisTopic("cost")!;
const cpa = topicMetric(cost, "cpa");

function drillAnomaly(overrides: Partial<DrillAnomaly>): DrillAnomaly {
  return {
    index: 0,
    date: "10-09",
    value: 80,
    direction: "up",
    severity: "negative",
    deltaText: "60.0%",
    deltaValue: 60,
    text: "",
    significant: true,
    baselineMean: 50,
    baselineSamples: 7,
    ...overrides,
  };
}

function paragraphText(paragraphs: SummaryParagraph[]): string {
  return paragraphs
    .map((paragraph) => paragraph.tokens.map((token) => token.text).join(""))
    .join("\n");
}

const anomaly: AnalysisAnomaly = {
  index: 10,
  date: "10-09",
  value: 13.85,
  direction: "up",
  severity: "negative",
  deltaText: "36.2%",
  deltaValue: 36.2,
  text: "",
};

const breakdowns = [
  {
    dimensionLabel: "主游戏",
    contributors: [
      {
        value: "策定九州东南亚",
        detail: drillAnomaly({
          value: 18,
          baselineMean: 10,
          deltaText: "80.0%",
          deltaValue: 80,
        }),
      },
    ],
  },
  {
    dimensionLabel: "渠道商",
    contributors: [
      {
        value: "android",
        detail: drillAnomaly({
          value: 46.99,
          baselineMean: 25.09,
          deltaText: "87.3%",
          deltaValue: 87.3,
        }),
      },
      {
        value: "ios",
        detail: drillAnomaly({
          value: 81.53,
          baselineMean: 54.67,
          deltaText: "49.1%",
          deltaValue: 49.1,
        }),
      },
      {
        value: "third",
        detail: drillAnomaly({
          significant: false,
          value: 1.2,
          baselineMean: 1,
          deltaText: "20.0%",
          deltaValue: 20,
        }),
      },
    ],
  },
  {
    dimensionLabel: "媒体",
    contributors: [
      {
        value: "Facebook",
        detail: drillAnomaly({
          value: 166.79,
          baselineMean: 46.01,
          deltaText: "262.5%",
          deltaValue: 262.5,
        }),
      },
    ],
  },
];

test("summarises the view as overview + one paragraph per dimension", () => {
  const paragraphs = buildViewSummary({
    topic: cost,
    totalsRow: {
      消耗: 11_980_000,
      返点后消耗: 10_430_000,
      新增进入: 1_020_000,
    },
    windowLabel: "2026-09-28 ~ 2026-10-27",
    windowDays: 30,
    metric: cpa,
    anomaly,
    breakdowns,
  });

  expect(paragraphs.map((paragraph) => paragraph.key)).toEqual([
    "overview",
    "dimension-主游戏",
    "dimension-渠道商",
    "dimension-媒体",
  ]);
  const summary = paragraphText(paragraphs);
  expect(summary).toContain("过去 30 天（9 月 28 日至 10 月 27 日）");
  expect(summary).toContain("累计消耗 1,198 万，平均每天约 39.9 万");
  expect(summary).not.toContain("返点后消耗");
  expect(summary).toContain("其中 10 月 9 日的 CPA 为 13.85，比 7 日移动平均高出 36.2%");
  expect(summary).toContain("从主游戏来看，主要来自「策定九州东南亚」");
  expect(summary).toContain("从渠道商来看，主要来自「android」");
  expect(summary).toContain("「ios」次之");
  expect(summary).not.toContain("third");
  expect(summary).toContain("从媒体来看，主要来自「Facebook」");

  // Key values carry tones so the UI can colour them.
  expect(paragraphs[0].tokens).toContainEqual({
    text: "36.2%",
    tone: "negative",
  });
  expect(paragraphs[0].tokens).toContainEqual({ text: "1,198 万", tone: "value" });
  expect(paragraphs[2].tokens).toContainEqual({
    text: "87.3%",
    tone: "negative",
  });
  expect(paragraphs[3].tokens).toContainEqual({
    text: "262.5%",
    tone: "negative",
  });
});

test("falls back to the largest deviations when nothing is significant", () => {
  const paragraphs = buildViewSummary({
    topic: cost,
    totalsRow: null,
    windowLabel: "",
    windowDays: 0,
    metric: cpa,
    anomaly: {
      ...anomaly,
      direction: "down",
      deltaText: "22.0%",
      deltaValue: 22,
      severity: "positive",
    },
    breakdowns: [
      {
        dimensionLabel: "渠道商",
        contributors: [
          {
            value: "ios",
            detail: drillAnomaly({
              significant: false,
              direction: "down",
              deltaText: "22.0%",
              deltaValue: 22,
              value: 70,
              baselineMean: 90,
            }),
          },
        ],
      },
    ],
  });

  const summary = paragraphText(paragraphs);
  expect(paragraphs).toHaveLength(2);
  expect(summary).not.toContain("过去");
  expect(summary).toContain("比 7 日移动平均低了 22.0%");
  expect(summary).toContain("波动最大的是「ios」");
  expect(summary).toContain("都没有达到异常判定标准");
});
