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
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import { beforeEach, expect, test, vi } from "vitest";
import type { EChartsOption } from "echarts";
import AnalysisDrillChart from "@/pages/Analysis/components/AnalysisDrillChart";
import AnalysisTrendChart from "@/pages/Analysis/components/AnalysisTrendChart";
import EfficiencyScatter from "@/pages/Analysis/components/EfficiencyScatter";
import LtvRoiCurves from "@/pages/Analysis/components/LtvRoiCurves";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";
import { supersetPalette } from "@/theme/palette";

const captured = vi.hoisted(() => ({ options: [] as EChartsOption[] }));

vi.mock("@/pages/Briefing/EChart", () => ({
  default: (props: { option: EChartsOption }) => {
    captured.options.push(props.option);
    return <div data-testid="chart" />;
  },
}));

const UNTRUSTED = `<img src=x onerror="alert('xss')">&"'`;
const cost = getAnalysisTopic("cost")!;
const retention = getAnalysisTopic("retention")!;
const ltvRoi = getAnalysisTopic("ltv-roi")!;
const theme = createTheme({ palette: supersetPalette });

type TooltipOption = {
  tooltip?: { formatter?: (params: unknown) => string };
};

function latestTooltip(): TooltipOption {
  return (captured.options.at(-1) ?? {}) as unknown as TooltipOption;
}

function expectTextOnly(html: string, text: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  expect(template.content.querySelector("img, svg, script")).toBeNull();
  expect(template.content.textContent).toContain(text);
}

beforeEach(() => {
  captured.options.length = 0;
});

test("scatter tooltips render database dimension values as text", () => {
  render(
    <ThemeProvider theme={theme}>
      <EfficiencyScatter
        topic={cost}
        rows={[{ 渠道商: UNTRUSTED, cpa: 1, 流水ROI: 2, 返点后消耗: 3 }]}
        dimension="渠道商"
        loading={false}
      />
    </ThemeProvider>,
  );

  const html = latestTooltip().tooltip?.formatter?.({
    data: { name: UNTRUSTED, value: [1, 2, 3] },
  });
  expectTextOnly(html ?? "", UNTRUSTED);
});

test("curve tooltips render series names and values as text", () => {
  render(
    <ThemeProvider theme={theme}>
      <LtvRoiCurves
        topic={ltvRoi}
        totals={{ ltv_1: 2, roi_1: 2 }}
        loading={false}
      />
    </ThemeProvider>,
  );

  const html = latestTooltip().tooltip?.formatter?.([
    { dataIndex: 0, seriesName: UNTRUSTED, value: UNTRUSTED },
  ]);
  expectTextOnly(html ?? "", UNTRUSTED);
});

test("drill tooltips render category and series text without creating tags", () => {
  render(
    <AnalysisDrillChart
      topic={cost}
      rows={[{ 渠道商: UNTRUSTED, 返点后消耗: 100, cpa: 10 }]}
      dimension="渠道商"
      loading={false}
    />,
  );

  const html = latestTooltip().tooltip?.formatter?.([
    { dataIndex: 0, seriesName: UNTRUSTED, value: UNTRUSTED },
  ]);
  expectTextOnly(html ?? "", UNTRUSTED);
});

test("trend tooltips render raw date fallbacks and metric labels as text", () => {
  const metric = topicMetric(cost, "cpa");
  const topic = {
    ...cost,
    metrics: {
      ...cost.metrics,
      cpa: { ...metric, label: UNTRUSTED },
    },
  };
  render(
    <AnalysisTrendChart
      topic={topic}
      rows={[{ 日期: UNTRUSTED, 返点后消耗: 100, cpa: 10, 新增进入: 10 }]}
      loading={false}
    />,
  );

  const html = latestTooltip().tooltip?.formatter?.([{ dataIndex: 0 }]);
  expectTextOnly(html ?? "", UNTRUSTED);
});

test("anomaly tooltips render business labels as text", () => {
  const metric = topicMetric(retention, "retention2");
  const topic = {
    ...retention,
    metrics: {
      ...retention.metrics,
      retention2: { ...metric, label: UNTRUSTED },
    },
  };
  const dates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(60 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const previousDates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(90 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const row = (date: string, value: number) => ({
    日期: date,
    "2日留存率": value,
    "1日付费率": 0.01,
    "7日付费留存率": 0.3,
  });
  render(
    <AnalysisTrendChart
      topic={topic}
      rows={dates.map((date, index) => row(date, index === 8 ? 0.15 : 0.2))}
      previousRows={previousDates.map((date) => row(date, 0.2))}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  const series = captured.options.at(-1)?.series as
    { name?: string; tooltip?: TooltipOption["tooltip"] }[] | undefined;
  const html = series
    ?.find((item) => item.name === "异常点")
    ?.tooltip?.formatter?.({ dataIndex: 0 });
  expectTextOnly(html ?? "", UNTRUSTED);
});
