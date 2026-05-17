import { render, screen } from '@testing-library/react';
import DataPreviewTable from '@/components/DataPreviewTable';
import { test, expect } from 'vitest';

test('renders "No data" when data is null', () => {
  render(<DataPreviewTable data={null} />);
  expect(screen.getByText('No data')).toBeInTheDocument();
});

test('renders "No data" when data is undefined', () => {
  render(<DataPreviewTable data={undefined} />);
  expect(screen.getByText('No data')).toBeInTheDocument();
});

test('renders "No data" when data array is empty', () => {
  render(<DataPreviewTable data={{ data: [] }} />);
  expect(screen.getByText('No data')).toBeInTheDocument();
});

test('renders table rows from data', () => {
  const data = {
    data: [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ],
  };
  render(<DataPreviewTable data={data} />);
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.getByText('30')).toBeInTheDocument();
  expect(screen.getByText('25')).toBeInTheDocument();
});

test('renders column headers from data keys', () => {
  const data = {
    data: [{ name: 'Alice', age: 30 }],
  };
  render(<DataPreviewTable data={data} />);
  expect(screen.getByText('name')).toBeInTheDocument();
  expect(screen.getByText('age')).toBeInTheDocument();
});

test('respects maxRows limit', () => {
  const data = {
    data: Array.from({ length: 10 }, (_, i) => ({ id: i })),
  };
  render(<DataPreviewTable data={data} maxRows={3} />);
  const cells = screen.getAllByText(/^[0-9]$/);
  expect(cells.length).toBeLessThanOrEqual(3);
});

test('uses custom formatter', () => {
  const data = { data: [{ value: 100 }] };
  render(
    <DataPreviewTable
      data={data}
      formatCell={(key, value) => `${key}=${String(value)}`}
    />,
  );
  expect(screen.getByText('value=100')).toBeInTheDocument();
});
