import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { getTheme } from "@/theme";
import { useThemeStore } from "@/store/themeStore";
import App from "@/views/App";
import api from "@/api";
import { refreshFederatedDatasets } from "@/config/federatedDatasets";
import "./index.css";

const emotionCache = createCache({
  key: "superset",
  prepend: false,
});

function Root() {
  const themeMode = useThemeStore((s) => s.theme);
  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    refreshFederatedDatasets(api);
  }, []);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <App />
          </BrowserRouter>
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
