import { forwardRef, useState } from 'react';
import MuiPagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import FormControl from '@mui/material/FormControl';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';

export interface PaginationProps {
  current?: number;
  total?: number;
  pageSize?: number;
  onChange?: (page: number, pageSize: number) => void;
  showSizeChanger?: boolean;
  pageSizeOptions?: number[];
}

const SupersetPagination = forwardRef<HTMLDivElement, PaginationProps>(
  ({ current = 1, total = 0, pageSize: initialPageSize = 10, onChange, showSizeChanger, pageSizeOptions = [10, 20, 50, 100] }, ref) => {
    const [pageSize, setPageSize] = useState(initialPageSize);
    const count = Math.max(1, Math.ceil(total / pageSize));

    return (
      <Stack ref={ref} direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        {showSizeChanger && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Page size:
            </Typography>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <MuiSelect
                value={pageSize}
                onChange={e => {
                  const newSize = Number(e.target.value);
                  setPageSize(newSize);
                  onChange?.(1, newSize);
                }}
              >
                {pageSizeOptions.map(size => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </MuiSelect>
            </FormControl>
          </Stack>
        )}
        <MuiPagination
          page={current > count ? count : current}
          count={count}
          onChange={(_event, page) => onChange?.(page, pageSize)}
          color="primary"
          shape="rounded"
        />
      </Stack>
    );
  },
);

SupersetPagination.displayName = 'SupersetPagination';

export default SupersetPagination;
