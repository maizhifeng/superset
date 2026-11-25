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

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

export interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

interface ActivityBarProps {
  items: ActivityBarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onItemEnter?: (id: string) => void;
  onItemLeave?: () => void;
  searchButton?: React.ReactNode;
  searchDialog?: React.ReactNode;
  userMenu?: React.ReactNode;
  mobileMenuButton?: React.ReactNode;
  mobileDrawer?: React.ReactNode;
}

export default function ActivityBar({
  items,
  activeId,
  onSelect,
  onItemEnter,
  onItemLeave,
  searchButton,
  searchDialog,
  userMenu,
  mobileMenuButton,
  mobileDrawer,
}: ActivityBarProps) {
  return (
    <Box
      sx={{
        width: 48,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0,
        pt: 0.5,
        pb: 1,
        gap: 0.5,
      }}
    >
      {mobileMenuButton && (
        <Box sx={{ display: { xs: "flex", sm: "none" } }}>
          {mobileMenuButton}
        </Box>
      )}
      <Box
        sx={{
          display: { xs: "none", sm: "flex" },
          flexDirection: "column",
          gap: 0.5,
          flex: 1,
        }}
      >
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <Tooltip
              key={item.id}
              title={item.label}
              placement="right"
              slotProps={{ popper: { sx: { pointerEvents: "none" } } }}
            >
              <Box
                sx={{ position: "relative" }}
                onMouseEnter={() => onItemEnter?.(item.id)}
                onMouseLeave={onItemLeave}
              >
                {isActive && (
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 20,
                      bgcolor: "primary.main",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  aria-label={item.label}
                  aria-pressed={isActive}
                  onClick={() => onSelect(item.id)}
                  onFocus={() => onItemEnter?.(item.id)}
                  sx={{
                    width: 36,
                    height: 36,
                    color: isActive ? "primary.main" : "text.secondary",
                    bgcolor: isActive ? "action.selected" : "transparent",
                    borderRadius: 1.5,
                    "&:hover": {
                      bgcolor: isActive ? "action.selected" : "action.hover",
                    },
                  }}
                >
                  {item.icon}
                </IconButton>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      {userMenu && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {searchButton}
        </Box>
      )}
      {userMenu && <Box sx={{ mt: "auto", pt: 0.5 }}>{userMenu}</Box>}
      {searchDialog}
      {mobileDrawer}
    </Box>
  );
}
