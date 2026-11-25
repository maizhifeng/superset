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
  clearAuthAndBackup,
  getStoredBackupRefreshToken,
  setStoredBackupRefreshToken,
  setStoredRefreshToken,
} from "@/api/tokenStorage";
import { storeRecentSqlQueries } from "@/utils/recentSql";

beforeEach(() => {
  localStorage.clear();
});

test("backup refresh token round-trips and clears with auth", () => {
  setStoredRefreshToken("user-refresh");
  setStoredBackupRefreshToken("admin-refresh");

  expect(getStoredBackupRefreshToken()).toBe("admin-refresh");

  clearAuthAndBackup();

  expect(getStoredBackupRefreshToken()).toBeNull();
});

test("clearing auth removes recent SQL for every user", () => {
  storeRecentSqlQueries("alice", ["select 1"]);
  storeRecentSqlQueries("bob", ["select 2"]);
  localStorage.setItem("superset-sql-lab-recent-queries", '["legacy"]');

  clearAuthAndBackup();

  expect(localStorage.length).toBe(0);
});
