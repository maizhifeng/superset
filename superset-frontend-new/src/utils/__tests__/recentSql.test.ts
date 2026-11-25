/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

import { beforeEach, expect, test } from "vitest";
import {
  clearAllRecentSqlQueries,
  clearRecentSqlQueries,
  readRecentSqlQueries,
  storeRecentSqlQueries,
} from "@/utils/recentSql";

beforeEach(() => {
  localStorage.clear();
});

test("recent SQL is scoped by username", () => {
  storeRecentSqlQueries("alice", ["select alice"]);
  storeRecentSqlQueries("bob", ["select bob"]);

  expect(readRecentSqlQueries("alice")).toEqual(["select alice"]);
  expect(readRecentSqlQueries("bob")).toEqual(["select bob"]);
});

test("invalid stored JSON does not break recent SQL", () => {
  localStorage.setItem(
    "superset-sql-lab-recent-queries:alice",
    "{invalid-json",
  );

  expect(readRecentSqlQueries("alice")).toEqual([]);
});

test("clearing one user keeps other users intact", () => {
  storeRecentSqlQueries("alice", ["select alice"]);
  storeRecentSqlQueries("bob", ["select bob"]);

  clearRecentSqlQueries("alice");

  expect(readRecentSqlQueries("alice")).toEqual([]);
  expect(readRecentSqlQueries("bob")).toEqual(["select bob"]);
});

test("clearing all recent SQL removes legacy and scoped keys", () => {
  storeRecentSqlQueries("alice", ["select alice"]);
  localStorage.setItem("superset-sql-lab-recent-queries", '["legacy"]');

  clearAllRecentSqlQueries();

  expect(readRecentSqlQueries("alice")).toEqual([]);
  expect(localStorage.getItem("superset-sql-lab-recent-queries")).toBeNull();
});
