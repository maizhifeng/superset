import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { theme } from '@/theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';
import { ToolbarProvider } from '@/contexts/ToolbarContext';
import App from '@/views/App';
import './index.css';

const emotionCache = createCache({
  key: 'superset',
  prepend: false,
});

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <BreadcrumbProvider>
            <ToolbarProvider>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <App />
              </BrowserRouter>
            </LocalizationProvider>
            </ToolbarProvider>
          </BreadcrumbProvider>
          </AuthProvider>
      </ThemeProvider>
    </CacheProvider>,
  );
}
