import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
    checker({ typescript: true }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@superset-ui/core': resolve(__dirname, 'packages/superset-ui-core/src'),
      '@superset-ui/chart-controls': resolve(
        __dirname,
        'packages/superset-ui-chart-controls/src',
      ),
      '@superset-ui/switchboard': resolve(
        __dirname,
        'packages/superset-ui-switchboard/src',
      ),
      '@apache-superset/core': resolve(__dirname, 'packages/superset-core/src'),
    },
  },
  css: {
    lightningcss: {},
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 9000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.SUPERSET_HOST || 'http://localhost:8088',
        changeOrigin: true,
        headers: {
          'X-Forwarded-Host': 'localhost:9000',
          'X-Forwarded-Proto': 'http',
        },
      },
      '/api/v1': {
        target: process.env.SUPERSET_HOST || 'http://localhost:8088',
        changeOrigin: true,
        headers: {
          'X-Forwarded-Host': 'localhost:9000',
          'X-Forwarded-Proto': 'http',
        },
      },
    },
  },
});
