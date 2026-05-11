// ============================================================
// 应用入口 — Provider 层级、Emotion cache、QueryClient 配置
// ============================================================
// Provider 层级（从外到内）：
//   StrictMode → CacheProvider → QueryClientProvider
//   → ThemeContext → AuthProvider → BrowserRouter
//   → MUI ThemeProvider → DatePicker LocalizationProvider
//   → CssBaseline → App
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { ThemeProvider as ColorThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import App from './App';
import theme from './theme';
import './index.css';
import './styles/design-tokens.css';
import './styles/components.css';

// Emotion cache — prepend: false 确保 MUI <style> 标签在 import 的 CSS 之后注入，
// 使 MUI 组件样式获得最高级联优先级，不被外部 CSS 覆盖。
const emotionCache = createCache({
  key: 'css',
  prepend: false,
});

// 修复 Chrome aria-hidden 焦点警告：
// MUI v9 ModalManager.ariaHiddenSiblings() 在焦点移入新 modal 前，
// 将 aria-hidden 应用到同级元素。如果被聚焦的元素恰好是正在被隐藏的
// 元素的后代，Chrome 会报错。这里在 aria-hidden 生效前同步 blur。
const _setAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name, value) {
  if (name === 'aria-hidden' && value === 'true' && this.contains(document.activeElement)) {
    document.activeElement?.blur();
  }
  _setAttribute.call(this, name, value);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CacheProvider value={emotionCache}>
      <QueryClientProvider client={queryClient}>
        <ColorThemeProvider>
          <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ThemeProvider theme={theme}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <CssBaseline />
                <App />
              </LocalizationProvider>
            </ThemeProvider>
          </BrowserRouter>
          </AuthProvider>
        </ColorThemeProvider>
      </QueryClientProvider>
    </CacheProvider>
  </React.StrictMode>
);
