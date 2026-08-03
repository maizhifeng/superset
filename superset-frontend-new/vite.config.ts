import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import checker from "vite-plugin-checker";
import compression from "vite-plugin-compression";
import { existsSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

const CERT_DIR = resolve(__dirname, "certs");
const TLS_KEY = resolve(CERT_DIR, "192.168.23.34+3-key.pem");
const TLS_CERT = resolve(CERT_DIR, "192.168.23.34+3.pem");
const USE_MKCERT = existsSync(TLS_KEY) && existsSync(TLS_CERT);

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
          ...(USE_MKCERT ? [] : [basicSsl()]),
        ]),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@superset-ui/core": resolve(__dirname, "packages/superset-ui-core/src"),
      "@superset-ui/chart-controls": resolve(
        __dirname,
        "packages/superset-ui-chart-controls/src",
      ),
      "@superset-ui/switchboard": resolve(
        __dirname,
        "packages/superset-ui-switchboard/src",
      ),
      "@apache-superset/core": resolve(__dirname, "packages/superset-core/src"),
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
    sourcemap: true,
    target: "es2020",
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes("node_modules/echarts/core")) return "echarts-core";
          if (id.includes("node_modules/echarts/charts"))
            return "echarts-charts";
          if (id.includes("node_modules/echarts/components"))
            return "echarts-components";
          if (id.includes("node_modules/echarts/renderers"))
            return "echarts-renderers";
          if (id.includes("node_modules/@mui/x-data-grid")) return "mui-x-grid";
          if (id.includes("node_modules/@mui/x-date-pickers"))
            return "mui-x-pickers";
          if (id.includes("node_modules/@mui/x-tree-view"))
            return "mui-x-tree-view";
          if (
            id.includes("node_modules/@codemirror") ||
            id.includes("node_modules/@uiw/react-codemirror")
          )
            return "codemirror";
          if (id.includes("node_modules/@dnd-kit")) return "dnd-kit";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-router")
          )
            return "react-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 9000,
    host: "0.0.0.0",
    ...(USE_MKCERT ? { https: { key: TLS_KEY, cert: TLS_CERT } } : {}),
    proxy: {
      "/api/v1": {
        target: process.env.SUPERSET_HOST || "http://localhost:8088",
        changeOrigin: true,
        headers: {
          "X-Forwarded-Host": "localhost:9000",
          "X-Forwarded-Proto": "https",
        },
      },
      "/llm": {
        target: "http://host.docker.internal:1234/v1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm/, ""),
      },
      "/agent/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "spec/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", "dist"],
    css: true,
  },
});
