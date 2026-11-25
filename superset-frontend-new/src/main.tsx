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

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
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
    const themeColor = themeMode === "notion" ? "#0075de" : "#b8653a";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColor);
  }, [themeMode]);

  useEffect(() => {
    // The interface is Chinese; without this the date pickers rendered
    // US-format dates (09/19/2026) inside Chinese labels.
    dayjs.locale("zh-cn");
    void refreshFederatedDatasets(api);
  }, []);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<Root />);
}
