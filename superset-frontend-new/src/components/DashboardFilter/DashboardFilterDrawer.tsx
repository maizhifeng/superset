import { useRef, useMemo, useCallback } from 'react';
import Collapse from '@mui/material/Collapse';
import Box from '@mui/material/Box';
import type { FilterConfig, FilterState } from './types';
import FilterPanel from './FilterPanel';

interface DashboardFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  filters: FilterConfig[];
  filterState: FilterState;
  onFilterChange: (id: string, value: unknown) => void;
  onClearAll: () => void;
  pendingFilterIds?: string[];
}

const SWIPE_THRESHOLD = 30;

export default function DashboardFilterDrawer({
  open,
  onClose,
  onOpen,
  filters,
  filterState,
  onFilterChange,
  onClearAll,
  pendingFilterIds,
}: DashboardFilterDrawerProps) {
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);

  const activeCount = useMemo(() => {
    let count = 0;
    for (const s of Object.values(filterState)) {
      const v = s.value;
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      count++;
    }
    return count;
  }, [filterState]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
    if (dx > dy * 2) return;
    if (dy > SWIPE_THRESHOLD && !open) {
      onOpen();
    } else if (dy < -SWIPE_THRESHOLD && open) {
      onClose();
    }
  }, [open, onOpen, onClose]);

  const handlePill = (
    <Box
      sx={{
        width: 48,
        height: 5,
        borderRadius: 2.5,
        bgcolor: activeCount > 0 ? 'primary.light' : 'grey.400',
        transition: 'background-color 200ms',
      }}
    />
  );

  return (
    <Box
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      sx={{ width: '100%', position: 'sticky', top: 0, zIndex: 10, bgcolor: 'background.paper' }}
    >
      <Box
        onClick={() => (open ? onClose() : onOpen())}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.5,
          width: '100%',
          '&:hover': { bgcolor: 'action.hover' },
          userSelect: 'none',
        }}
      >
        {handlePill}
      </Box>
      <Collapse in={open} timeout={250}>
        <Box
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            boxShadow: 3,
            maxHeight: 320,
            overflow: 'auto',
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
          }}
        >
          <FilterPanel
            filters={filters}
            filterState={filterState}
            onFilterChange={onFilterChange}
            pendingFilterIds={pendingFilterIds}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
