import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useDashboardStore } from '@/store';
import { ActiveFilterTag } from './ActiveFilterTag';

/**
 * Active filter zone - container for activated temporary filters
 * Features: receives drag from candidate pool
 * Visual: empty state placeholder when no filters
 */
export function ActiveFilterZone() {
  const activeFilters = useDashboardStore(state => state.globalFilters.active);
  const activateFilter = useDashboardStore(state => state.activateFilter);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const filterId = e.dataTransfer.getData('filterId');
    if (filterId) {
      activateFilter(filterId);
    }
  };

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 1,
        minHeight: 40,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        backgroundColor: isDragOver
          ? 'var(--mui-palette-tertiary-container)'
          : 'var(--mui-palette-background-paper)',
        border: isDragOver
          ? '1px dashed var(--mui-palette-tertiary-main)'
          : '1px solid var(--mui-palette-border-light)',
        transition: 'all 150ms cubic-bezier(0, 0, 0.2, 1)',
        overflow: 'auto',
      }}
    >
      {activeFilters?.map((filter) => (
        <ActiveFilterTag key={filter.filterId} filterId={filter.filterId} />
      ))}
      {activeFilters?.length === 0 && !isDragOver && (
        <Typography
          sx={{
            color: 'var(--mui-palette-text-secondary)',
            fontSize: '0.75rem',
          }}
        >
          +筛选器
        </Typography>
      )}
      {isDragOver && (
        <Typography
          sx={{
            color: 'var(--mui-palette-tertiary-onContainer)',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          释放激活
        </Typography>
      )}
    </Box>
  );
}