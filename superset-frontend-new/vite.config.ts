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

import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import compression from "vite-plugin-compression";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: [
      "immer",
      "react",
      "react-dom",
      "react-router-dom",
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
      "echarts",
      "echarts-for-react",
      "dayjs",
      "axios",
      "zustand",
    ],
  },
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),
    ...(process.env.VITEST ? [] : [checker({ typescript: true })]),
    ...(process.env.VITEST
      ? []
      : [
          compression({
            algorithm: "gzip",
            ext: ".gz",
            threshold: 1024,
          }),
          compression({
            algorithm: "brotliCompress",
            ext: ".br",
            threshold: 1024,
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@fixtures": resolve(__dirname, "spec/fixtures"),
    },
  },
  define: {
    "process.env": "{}",
    process: "{}",
    global: "globalThis",
  },
  css: {
    lightningcss: {},
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: process.env.GENERATE_SOURCEMAP === "true",
    target: "es2020",
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 9000,
    host: "0.0.0.0",
    proxy: {
      "/api/v1": {
        target: process.env.SUPERSET_HOST || "http://localhost:8088",
        changeOrigin: true,
        headers: {
          "X-Forwarded-Host": "localhost:9000",
          "X-Forwarded-Proto": "http",
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 10_000,
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "spec/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", "dist"],
    css: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/setupTests.ts",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 45,
        functions: 38,
        branches: 36,
      },
    },
  },
});
