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
import { parseBackendDate } from "@/utils/datetime";

test("treats naive backend datetimes as UTC, not local time", () => {
  // Backend serializes DateTime columns without a timezone designator; the
  // instant is UTC.  On a UTC+8 machine the naive string "09:34" must parse
  // to the same epoch as "09:34Z" (17:34 local), not local 09:34.
  const naive = parseBackendDate("2026-08-27T09:34:29.404826");
  const withZ = new Date("2026-08-27T09:34:29.404826Z");
  expect(naive.getTime()).toBe(withZ.getTime());
});

test("passes through timezone-aware values unchanged", () => {
  const withZ = "2026-08-27T17:34:29.404826Z";
  expect(parseBackendDate(withZ).getTime()).toBe(new Date(withZ).getTime());

  const withOffset = "2026-08-27T17:34:29.404826+08:00";
  expect(parseBackendDate(withOffset).getTime()).toBe(
    new Date(withOffset).getTime(),
  );
});

test("handles date-only values", () => {
  expect(parseBackendDate("2026-08-27").getTime()).toBe(
    new Date("2026-08-27").getTime(),
  );
});

test("invalid input yields an invalid date", () => {
  expect(Number.isNaN(parseBackendDate("not-a-date").getTime())).toBe(true);
});
