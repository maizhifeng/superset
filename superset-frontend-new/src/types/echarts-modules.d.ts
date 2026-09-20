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
 * Types for ECharts modules that are imported by path.
 *
 * ``src/utils/echarts.ts`` loads the mark-line component from its own module
 * instead of the ``echarts/components`` barrel, because going through the
 * barrel made the bundler include every component in it (brush, dataZoom,
 * visualMap, toolbox…) — roughly 260KB of unused code for one threshold line.
 * The package ships types for the barrel only, so the path import is declared
 * here.
 */
declare module "echarts/lib/component/marker/installMarkLine.js" {
  /** ECharts installer, consumed via ``core.use([...])``. */
  export function install(registers: unknown): void;
}
