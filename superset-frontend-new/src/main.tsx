import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { getTheme } from "@/theme";
import { useThemeStore } from "@/store/themeStore";
import App from "@/views/App";
import api from "@/api";
import { queryClient } from "@/api/queryClient";
import { refreshFederatedDatasets } from "@/config/federatedDatasets";
import "./index.css";

const emotionCache = createCache({
  key: "superset",
  prepend: false,
});

export function Root() {
  const themeMode = useThemeStore((s) => s.theme);
  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    const themeColor =
      themeMode === "notion" ? "#0075de" : "#b8653a";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColor);
  }, [themeMode]);

  useEffect(() => {
    void refreshFederatedDatasets(api);
  }, []);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<Root />);
}
