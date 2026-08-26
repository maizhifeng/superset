import { describe, expect, test } from "vitest";
import {
  EMPTY_PARAMS,
  normalizeReportType,
  paramsFromConfig,
  paramsToConfig,
} from "@/pages/Briefing/params";

describe("briefing params", () => {
  test("defaults to a daily briefing", () => {
    expect(EMPTY_PARAMS.report_type).toBe("daily");
    const cfg = paramsToConfig(EMPTY_PARAMS);
    expect(cfg.report_type).toBe("daily");
  });

  test("round-trips a weekly configuration", () => {
    const form = {
      ...EMPTY_PARAMS,
      report_type: "weekly" as const,
      name: "游戏周报",
      weeks_of_history: 8,
      top_projects_count: 5,
      alert_critical_threshold: 40,
    };
    const payload = paramsToConfig(form);
    expect(payload.report_type).toBe("weekly");
    expect(payload.weeks_of_history).toBe(8);

    // The stored payload feeds back into the form (edit dialog flow).
    const restored = paramsFromConfig(payload);
    expect(restored).toEqual(form);
  });

  test("legacy configs without report_type read as daily", () => {
    const restored = paramsFromConfig({ name: "旧简报" });
    expect(restored.report_type).toBe("daily");
  });

  test("unknown stored types normalize to daily", () => {
    expect(normalizeReportType("monthly")).toBe("daily");
    expect(normalizeReportType(undefined)).toBe("daily");
    expect(normalizeReportType("weekly")).toBe("weekly");
  });

  test("empty numeric fields persist as null, not zero", () => {
    const payload = paramsToConfig({
      ...EMPTY_PARAMS,
      days_of_history: "",
      weeks_of_history: "",
    });
    expect(payload.days_of_history).toBeNull();
    expect(payload.weeks_of_history).toBeNull();
  });
});
