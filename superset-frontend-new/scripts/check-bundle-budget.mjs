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

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const html = readFileSync(path.join(distDir, "index.html"), "utf8");
const entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const preloads = Array.from(
  html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  (match) => match[1],
);

if (!entry) {
  throw new Error("Unable to find the production entry script");
}

const assets = [entry, ...preloads].map((asset) =>
  path.join(distDir, asset.replace(/^\//, "")),
);
let totalBytes = 0;
for (const asset of assets) {
  const brotli = `${asset}.br`;
  try {
    totalBytes += statSync(brotli).size;
  } catch {
    throw new Error(`Missing Brotli artifact: ${brotli}`);
  }
}

const limitKilobytes = Number(process.env.BUNDLE_BROTLI_LIMIT_KB ?? "220");
const totalKilobytes = totalBytes / 1024;
console.log(
  `Initial JS Brotli: ${totalKilobytes.toFixed(1)} KiB (limit ${limitKilobytes} KiB)`,
);

if (totalKilobytes > limitKilobytes) {
  throw new Error("Initial JS bundle exceeds the configured budget");
}
