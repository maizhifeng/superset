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

import { useRef } from "react";
import Box from "@mui/material/Box";
import PageHeader from "@/components/PageHeader";
import { useHomeStats } from "@/hooks/useHomeStats";
import BackToTop from "./components/BackToTop";
import {
  FavoriteAlerts,
  FavoriteCharts,
  FavoriteDashboards,
  FavoriteDatabases,
  FavoriteDatasets,
  FavoriteSavedQueries,
} from "./components/Favorites";
import ModuleGrid from "./components/ModuleGrid";
import QuickActions from "./components/QuickActions";
import RecentActivity from "./components/RecentActivity";
import {
  RecentQueries,
  RecentlyViewedCharts,
  RecentlyViewedDashboards,
} from "./components/RecentShortcuts";
import StatStrip from "./components/StatStrip";

export default function Home() {
  const stats = useHomeStats();
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
        <PageHeader title="欢迎使用 Starfly" subtitle="选择一个模块开始使用" />
        <BackToTop scrollRef={scrollRef} />
        <StatStrip stats={stats} />
        <QuickActions />
        <FavoriteCharts />
        <FavoriteDatasets />
        <FavoriteDatabases />
        <FavoriteSavedQueries />
        <FavoriteAlerts />
        <FavoriteDashboards />
        <RecentlyViewedCharts />
        <RecentlyViewedDashboards />
        <RecentActivity stats={stats} />
        <RecentQueries />
        <ModuleGrid stats={stats} />
      </Box>
    </Box>
  );
}
