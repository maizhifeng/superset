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
import { formatMetricValue, formatNumber } from "@/utils/formatNumber";

test("renders values at their original magnitude with thousands separators", () => {
  expect(formatNumber(1_234)).toBe("1,234");
  expect(formatNumber(1_234_567)).toBe("1,234,567");
  expect(formatNumber(12_345_678_901)).toBe("12,345,678,901");
  expect(formatNumber(-9_876)).toBe("-9,876");
});

test("keeps whole numbers whole and rounds fractions to one decimal", () => {
  expect(formatNumber(0)).toBe("0");
  expect(formatNumber(-0)).toBe("0");
  expect(formatNumber(1_234.5)).toBe("1,234.5");
  expect(formatNumber(1_234.56)).toBe("1,234.6");
  expect(formatNumber(0.25)).toBe("0.3");
});

test("never abbreviates with K/M/B/T suffixes", () => {
  for (const value of [1_000, 1_000_000, 1_000_000_000, 1_000_000_000_000]) {
    expect(formatNumber(value)).not.toMatch(/[KMBT]$/);
  }
});

test("keeps ratio metrics as percentages", () => {
  expect(formatMetricValue("roi_1", 0.853)).toBe("85.3%");
  expect(formatMetricValue("消耗", 12_345.6)).toBe("12,345.6");
});
