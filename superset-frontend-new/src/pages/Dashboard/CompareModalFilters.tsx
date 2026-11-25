/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useMemo, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { REGION_LABELS } from "@/config/regions";
import type { AnchorKey } from "@/pages/Dashboard/compareStartDate";
import {
  COL,
  gameKey,
  type GameOption,
  type SelectedGame,
} from "@/pages/Dashboard/compareModalModel";

interface CompareModeBadgeProps {
  tone: "error" | "info";
  children: ReactNode;
}

function CompareModeBadge({ tone, children }: CompareModeBadgeProps) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: -8,
        right: -8,
        px: 0.75,
        py: 0.15,
        borderRadius: "3px",
        bgcolor: tone === "error" ? "error.main" : "info.main",
        color: "common.white",
        fontSize: "0.65rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
        zIndex: 10,
        pointerEvents: "none",
        boxShadow: "var(--mui-palette-shadow-sm)",
      }}
    >
      <Box
        sx={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: "common.white",
          mr: 0.5,
          verticalAlign: "middle",
        }}
      />
      {children}
    </Box>
  );
}

export interface CompareModalFiltersProps {
  games: GameOption[];
  selectedGames: SelectedGame[];
  selectedCchNames: string[];
  selectedChannels: string[];
  cchNameValues: string[];
  channelValues: string[];
  primaryGameKey: string | null;
  inputValue: string;
  cchNameInput: string;
  channelInput: string;
  selectedAnchors: AnchorKey[];
  sectionCount: number;
  onGamesChange: (games: SelectedGame[]) => void;
  onPrimaryGameChange: (key: string | null) => void;
  onCchNamesChange: (values: string[]) => void;
  onChannelsChange: (values: string[]) => void;
  onInputValueChange: (value: string) => void;
  onCchNameInputChange: (value: string) => void;
  onChannelInputChange: (value: string) => void;
}

export function CompareModalFilters({
  games,
  selectedGames,
  selectedCchNames,
  selectedChannels,
  cchNameValues,
  channelValues,
  primaryGameKey,
  inputValue,
  cchNameInput,
  channelInput,
  selectedAnchors,
  sectionCount,
  onGamesChange,
  onPrimaryGameChange,
  onCchNamesChange,
  onChannelsChange,
  onInputValueChange,
  onCchNameInputChange,
  onChannelInputChange,
}: CompareModalFiltersProps) {
  const gameOptions = useMemo(
    () =>
      games.filter(
        (game) =>
          !selectedGames.some(
            (selected) => gameKey(selected) === gameKey(game),
          ),
      ),
    [games, selectedGames],
  );
  const cchNameOptions = useMemo(
    () => cchNameValues.filter((value) => !selectedCchNames.includes(value)),
    [cchNameValues, selectedCchNames],
  );
  const channelOptions = useMemo(
    () => channelValues.filter((value) => !selectedChannels.includes(value)),
    [channelValues, selectedChannels],
  );

  const isIntra =
    selectedAnchors.length === 1 &&
    selectedGames.length === 1 &&
    selectedCchNames.length <= 1 &&
    selectedChannels.length <= 1 &&
    (selectedCchNames.length > 0 || selectedChannels.length > 0);
  const isInter =
    selectedAnchors.length > 1 ||
    selectedCchNames.length > 1 ||
    selectedChannels.length > 1 ||
    selectedGames.length > 1;
  const showSectionStatus = isIntra || isInter;
  const showWarning = isInter && sectionCount > 4;

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      <Box sx={{ position: "relative" }}>
        <Autocomplete
          multiple
          value={selectedGames}
          inputValue={inputValue}
          onInputChange={(_, value) => onInputValueChange(value)}
          options={gameOptions}
          getOptionLabel={(option) => `${option.papp_name} [${option.papp_id}]`}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={gameKey(option)}>
              <Box
                component="span"
                sx={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {option.papp_name} [{option.papp_id}]
              </Box>
              {option.region === "oversea" && (
                <Box
                  component="span"
                  sx={{
                    ml: 1,
                    px: 0.5,
                    borderRadius: 0.5,
                    bgcolor: "action.hover",
                    color: "text.secondary",
                    fontSize: "0.7rem",
                    flexShrink: 0,
                  }}
                >
                  {REGION_LABELS.oversea}
                </Box>
              )}
            </Box>
          )}
          onChange={(_, value) => {
            onGamesChange(value);
            const newKeys = value.map((game: GameOption) => gameKey(game));
            if (newKeys.length > 0 && !newKeys.includes(primaryGameKey ?? "")) {
              onPrimaryGameChange(newKeys[0]);
            }
            if (newKeys.length === 0) onPrimaryGameChange(null);
          }}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          noOptionsText="无匹配"
          sx={{
            minWidth: 250,
            maxWidth: 400,
            "& .MuiInputBase-root": { minHeight: 36 },
            "& .MuiInputBase-input": {
              py: 0.5,
              fontSize: "0.8125rem",
              minWidth: 60,
            },
          }}
          slotProps={{
            chip: { size: "small", sx: { height: 20 } },
            popper: {
              sx: {
                "& .MuiAutocomplete-listbox .MuiAutocomplete-option": {
                  minHeight: 28,
                  fontSize: "0.8125rem",
                },
                "& .MuiPaper-root": {
                  border: "1px solid",
                  borderColor: "divider",
                },
              },
            },
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="选择要对比的游戏"
              placeholder={
                selectedGames.length > 0 ? "" : "按游戏名称或 ID 搜索"
              }
              size="small"
            />
          )}
        />
        {selectedGames.length > 1 && (
          <CompareModeBadge tone="error">外对比</CompareModeBadge>
        )}
      </Box>
      <Box sx={{ position: "relative" }}>
        <Autocomplete
          multiple
          value={selectedCchNames}
          inputValue={cchNameInput}
          onInputChange={(_, value) => onCchNameInputChange(value)}
          options={cchNameOptions}
          onChange={(_, value) => onCchNamesChange(value)}
          filterSelectedOptions
          disableCloseOnSelect
          size="small"
          sx={{ minWidth: 200, maxWidth: 300 }}
          noOptionsText="无选项"
          renderInput={(params) => (
            <TextField
              {...params}
              label={COL.cch_name_id}
              placeholder="选择渠道商"
            />
          )}
        />
        {selectedCchNames.length > 1 && (
          <CompareModeBadge tone="error">外对比</CompareModeBadge>
        )}
        {selectedCchNames.length <= 1 &&
          selectedGames.length === 1 &&
          selectedCchNames.length === 1 &&
          selectedChannels.length <= 1 && (
            <CompareModeBadge tone="info">内对比</CompareModeBadge>
          )}
      </Box>
      <Box sx={{ position: "relative" }}>
        <Autocomplete
          multiple
          value={selectedChannels}
          inputValue={channelInput}
          onInputChange={(_, value) => onChannelInputChange(value)}
          options={channelOptions}
          onChange={(_, value) => onChannelsChange(value)}
          filterSelectedOptions
          disableCloseOnSelect
          size="small"
          sx={{ minWidth: 200, maxWidth: 300 }}
          noOptionsText="无选项"
          renderInput={(params) => (
            <TextField
              {...params}
              label={COL.channel_name}
              placeholder="选择媒体"
            />
          )}
        />
        {selectedChannels.length > 1 && (
          <CompareModeBadge tone="error">外对比</CompareModeBadge>
        )}
        {selectedChannels.length <= 1 &&
          selectedGames.length === 1 &&
          selectedChannels.length === 1 &&
          selectedCchNames.length <= 1 && (
            <CompareModeBadge tone="info">内对比</CompareModeBadge>
          )}
      </Box>
      {showSectionStatus && (
        <>
          <Box
            sx={{
              ml: "auto",
              alignSelf: "center",
              color: "text.secondary",
              fontSize: "0.8125rem",
              whiteSpace: "nowrap",
              px: 1,
              py: 0.25,
              borderRadius: "4px",
              bgcolor: isIntra ? "status.infoBg" : "status.errorBg",
              border: "1px dashed",
              borderColor: isIntra
                ? "color-mix(in srgb, var(--mui-palette-info-main) 30%, transparent)"
                : "color-mix(in srgb, var(--mui-palette-error-main) 30%, transparent)",
            }}
          >
            {isIntra
              ? "选定为主表，其他为次表"
              : `维度组合独立分表 (${sectionCount}项)`}
          </Box>
          {showWarning && (
            <Box
              sx={{
                alignSelf: "center",
                px: 1,
                py: 0.15,
                borderRadius: "3px",
                bgcolor: "status.warningBg",
                border: "1px solid",
                borderColor:
                  "color-mix(in srgb, var(--mui-palette-warning-main) 40%, transparent)",
                color: "warning.main",
                fontSize: "0.7rem",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}
            >
              ⚠ 项目较多，可能影响性能
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
