import React from 'react';
import { Box, Skeleton as MuiSkeleton } from '@mui/material';

export function SkeletonCard({ count = 1 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            borderRadius: 2,
            boxShadow: 'var(--mui-palette-shadow-card)',
            border: '1px solid',
            borderColor: 'divider',
            p: 3,
            backgroundColor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <MuiSkeleton variant="rectangular" width={40} height={40} sx={{ borderRadius: 1 }} />
            <Box sx={{ flex: 1 }}>
              <MuiSkeleton variant="text" width="25%" sx={{ mb: 0.5 }} />
              <MuiSkeleton variant="text" width="50%" />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <MuiSkeleton variant="text" width="100%" />
            <MuiSkeleton variant="text" width="85%" />
            <MuiSkeleton variant="text" width="65%" />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        boxShadow: 'var(--mui-palette-shadow-card)',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <MuiSkeleton variant="rectangular" width={36} height={36} sx={{ borderRadius: 1, flexShrink: 0 }} />
            <MuiSkeleton variant="text" sx={{ flex: 1 }} />
            <MuiSkeleton variant="text" sx={{ flex: 1 }} />
            <MuiSkeleton variant="text" width={80} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function SkeletonText({ lines = 3 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <MuiSkeleton
          key={i}
          variant="text"
          sx={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </Box>
  );
}

export function DashboardSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <MuiSkeleton variant="text" width="33%" sx={{ mb: 0.5 }} />
        <MuiSkeleton variant="text" width="50%" />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          gap: 3,
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              borderRadius: 2,
              boxShadow: 'var(--mui-palette-shadow-card)',
              border: '1px solid',
              borderColor: 'divider',
              p: 3,
              backgroundColor: 'background.paper',
              minHeight: 160,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <MuiSkeleton variant="rectangular" width={48} height={48} sx={{ borderRadius: 1 }} />
              <Box sx={{ flex: 1 }}>
                <MuiSkeleton variant="text" width="50%" sx={{ mb: 0.5 }} />
                <MuiSkeleton variant="text" width="75%" />
              </Box>
            </Box>
            <MuiSkeleton variant="text" sx={{ mb: 0.5 }} />
            <MuiSkeleton variant="text" width="65%" />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function MetricListSkeleton() {
  return <SkeletonTable rows={5} />;
}

export function MetricBuilderSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <MuiSkeleton variant="text" width="25%" sx={{ mb: 0.5 }} />
        <MuiSkeleton variant="text" width="33%" />
      </Box>
      <SkeletonCard count={2} />
    </Box>
  );
}
