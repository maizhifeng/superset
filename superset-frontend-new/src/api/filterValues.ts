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

/**
 * Builds the rison ``q`` parameter consumed by the filter-values endpoints.
 *
 * The third-party JS rison encoder leaves anything outside
 * ``[-A-Za-z0-9~!*()_.',:@$/]`` percent-encoded instead of quoting it, so a
 * column such as ``主游戏[ID]`` comes out as a bare identifier.  The Python
 * parser rejects that and the backend silently drops every filter, returning
 * unfiltered values.  Building the query here always single-quotes strings so
 * both sides agree.
 */

export interface FilterValueFilter {
  col: string;
  op: string;
  /** Single value or list of values for the predicate */
  val: unknown;
}

/** rison string literal: always quoted, escaping `'` rison-style (`!'`). */
function quote(value: string): string {
  return `'${value.replace(/'/g, "!'")}'`;
}

/**
 * rison query for ``?q=`` describing an optional set of filter predicates.
 *
 * :param filters: predicates narrowing the returned distinct values
 * :param pageSize: how many values the backend may return
 */
export function filterValuesQuery(
  filters: FilterValueFilter[],
  pageSize = 10000,
): string {
  const predicates = filters.map((filter) => {
    const values = Array.isArray(filter.val) ? filter.val : [filter.val];
    const list = values.map((value) => quote(String(value))).join(",");
    return `(col:${quote(filter.col)},op:${quote(filter.op)},val:!(${list}))`;
  });
  return `(filters:!(${predicates.join(",")}),page:0,page_size:${pageSize})`;
}
