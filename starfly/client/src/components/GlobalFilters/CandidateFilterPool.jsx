import React from 'react';
import { Box } from '@mui/material';
import { CandidateFilterChip } from './CandidateFilterChip';
import { CANDIDATE_FILTERS } from '@/config/filterConfig';

/**
 * Candidate filter pool - container for inactive filters
 * Visual: grayed out chips, hover effect, single row with horizontal stacking
 */
export function CandidateFilterPool() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 22,
        flexShrink: 0,      // Don't shrink, maintain fixed width
      }}
    >
      {CANDIDATE_FILTERS.map(filter => (
        <CandidateFilterChip key={filter.id} filterId={filter.id} />
      ))}
    </Box>
  );
}