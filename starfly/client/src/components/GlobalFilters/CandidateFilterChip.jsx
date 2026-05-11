import React, { useState } from 'react';
import { Box, Chip } from '@mui/material';
import { useDashboardStore } from '@/store';
import { getFilterConfig } from '@/config/filterConfig';

/**
 * Candidate filter chip - inactive filter in candidate pool
 * Visual: grayed out (opacity: 0.5)
 * Interaction: click or drag to activate (inserts at front)
 * Animation: hover left slide hint
 */
export const CandidateFilterChip = React.memo(function CandidateFilterChip({ filterId }) {
  const config = getFilterConfig(filterId);
  const activateFilter = useDashboardStore(state => state.activateFilter);
  // Boolean selector — only re-renders when this specific filter's active state toggles
  const isActive = useDashboardStore(
    state => state.globalFilters.active.some(f => f.filterId === filterId)
  );

  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    if (!isActive) {
      activateFilter(filterId);
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('filterId', filterId);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  if (!config) return null;

  // Hide if already active
  if (isActive) return null;

  return (
    <Box sx={{ display: 'inline-flex' }}>
      <Chip
        label={config.label}
        size="small"
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        sx={{
          height: 22,
          fontSize: '0.75rem',
          backgroundColor: 'var(--mui-palette-bg-muted)',
          color: 'var(--mui-palette-text-secondary)',
          cursor: 'pointer',
          transition: 'opacity 250ms ease-out, transform 250ms ease-out, background-color 250ms ease-out, box-shadow 250ms ease-out',
          '&:hover': {
            opacity: 0.9,
            transform: 'translateX(-8px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            backgroundColor: 'var(--mui-palette-bg-hover)',
          },
          ...(isDragging && {
            opacity: 0.9,
            transform: 'scale(1.08)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            cursor: 'grabbing',
          }),
        }}
      />
    </Box>
  );
});
