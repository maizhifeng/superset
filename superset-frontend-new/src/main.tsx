import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { theme } from '@/theme';
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
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </LocalizationProvider>
      </ThemeProvider>
    </CacheProvider>,
  );
}
