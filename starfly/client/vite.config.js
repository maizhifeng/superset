import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Plugin to suppress Emotion SSR warnings in development
    {
      name: 'suppress-emotion-ssr-warning',
      enforce: 'pre',
      transformIndexHtml(html) {
        // Inject script at the very beginning of head to override console.error
        // Emotion uses console.error for SSR pseudo-class warnings
        const suppressScript = `
<script>
(function() {
  var originalConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var message = args[0];
    if (typeof message === 'string' && message.indexOf(':first-child') !== -1 && message.indexOf('potentially unsafe') !== -1) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
})();
</script>`;
        return html.replace('<head>', '<head>' + suppressScript);
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: !!(process.env.WSL_DISTRO_NAME || process.env.DOCKER_HOST),
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
