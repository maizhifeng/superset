import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: ["immer"],
  },
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),
    ...(process.env.VITEST ? [] : [checker({ typescript: true })]),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "starfly",
        short_name: "starfly",
        description: "Data Dashboard",
        theme_color: "#20a7c9",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
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
  css: {
    lightningcss: {},
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 9000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.SUPERSET_HOST || "http://localhost:8088",
        changeOrigin: true,
        headers: {
          "X-Forwarded-Host": "localhost:9000",
          "X-Forwarded-Proto": "http",
        },
      },
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
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "spec/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", "dist"],
    css: true,
  },
});
