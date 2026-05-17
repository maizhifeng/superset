import { Suspense, lazy } from 'react';
import type { DataGridProps } from '@mui/x-data-grid';
import { useMediaQuery, useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

const DataGrid = lazy(() =>
  import('@mui/x-data-grid').then(m => ({ default: m.DataGrid })),
);

export default function DataGridTable(props: DataGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>}>
      <DataGrid
      {...props}
      rowHeight={isMobile ? 52 : undefined}
      columnBufferPx={isMobile ? 150 : 200}
      virtualizeColumnsWithAutoRowHeight={false}
      sx={[
        {
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'background.paper',
            borderBottom: '2px solid',
            borderColor: 'primary.light',
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'text.secondary',
          },
          '& .MuiDataGrid-row': {
            cursor: props.onRowClick ? 'pointer' : 'default',
            transition: 'background-color 150ms ease, box-shadow 150ms ease',
            '&:hover': {
              backgroundColor: 'action.hover',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            },
            '&:nth-of-type(even)': {
              backgroundColor: 'rgba(0,0,0,0.02)',
            },
            '&:nth-of-type(even):hover': {
              backgroundColor: 'action.hover',
            },
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            borderBottom: '1px solid',
            borderColor: 'divider',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
          },
          '& .MuiDataGrid-cell--textLeft': {
            textAlign: 'left',
            justifyContent: 'flex-start',
          },
          '& .MuiDataGrid-cell:focus': {
            outline: 'none',
          },
          '& .MuiDataGrid-cell:focus-within': {
            outline: 'none',
          },
          '& .MuiDataGrid-cellContent': {
            lineHeight: 1.5,
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: '1px solid',
            borderColor: 'divider',
            minHeight: 48,
          },
          '& .MuiTablePagination-root': {
            fontSize: '0.75rem',
          },
          '& .MuiDataGrid-virtualScroller': {
            minHeight: 200,
          },
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    />
    </Suspense>
  );
}
