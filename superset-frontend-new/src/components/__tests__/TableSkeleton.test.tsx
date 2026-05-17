import { render } from '@testing-library/react';
import TableSkeleton from '@/components/TableSkeleton';
import { test, expect } from 'vitest';

test('renders default 8 rows', () => {
  const { container } = render(<TableSkeleton />);
  const rows = container.querySelectorAll('.MuiBox-root');
  // header row + 8 body rows
  expect(rows.length).toBeGreaterThanOrEqual(9);
});

test('renders custom row count', () => {
  const { container } = render(<TableSkeleton rows={3} />);
  const rows = container.querySelectorAll('.MuiBox-root');
  expect(rows.length).toBeGreaterThanOrEqual(4);
});
