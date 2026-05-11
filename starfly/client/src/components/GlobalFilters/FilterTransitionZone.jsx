import React from 'react';
import Box from '@mui/material/Box';
import { useDashboardStore } from '@/store';
import { ActiveFilterTag } from './ActiveFilterTag';

export const FilterTransitionZone = React.memo(function FilterTransitionZone() {
  const activeFilters = useDashboardStore(state => state.globalFilters.active);

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        minHeight: 36,
        px: 1,
        borderRadius: 1.5,
        backgroundColor: 'var(--mui-palette-background-paper)',
        transition: 'background-color 200ms ease',
      }}
    >
      {activeFilters?.map(filter => (
        <ActiveFilterTag key={filter.filterId} filterId={filter.filterId} />
      ))}
    </Box>
  );
});
