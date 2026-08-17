import { labelAction } from "@/pages/QueryHistoryList";
import { test, expect } from "vitest";

test("translates known REST actions to friendly Chinese labels", () => {
  expect(labelAction("UserLoggedIn")).toBe("登录");
  expect(labelAction("DashboardRestApi.get_list")).toBe("查看仪表板列表");
  expect(labelAction("ChartRestApi.put")).toBe("更新图表");
  expect(labelAction("DatasetRestApi.get")).toBe("查看数据集");
  expect(labelAction("ReportRestApi.post")).toBe("创建警报");
});

test("shows a fallback for unknown actions", () => {
  expect(labelAction(undefined)).toBe("未知操作");
  expect(labelAction("")).toBe("未知操作");
});

test("cleans package prefixes for unknown REST actions", () => {
  expect(labelAction("FooRestApi.get_list")).toBe("Foo.get list");
});
