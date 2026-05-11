/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { forwardRef, useState, type ReactNode } from 'react';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableContainer from '@mui/material/TableContainer';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableRow from '@mui/material/TableRow';
import MuiTableSortLabel from '@mui/material/TableSortLabel';
import MuiTablePagination from '@mui/material/TablePagination';
import MuiCircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

export interface TableColumn {
  key: string;
  title: string;
  dataIndex?: string;
  render?: (value: unknown, record: Record<string, unknown>, index: number) => ReactNode;
  sortable?: boolean;
}

export interface TablePaginationConfig {
  pageSize: number;
  current: number;
  total: number;
}

export interface TableOnChangeParams {
  pagination: { pageSize: number; current: number };
  sorter?: { columnKey: string; order: 'asc' | 'desc' };
}

export interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  loading?: boolean;
  pagination?: TablePaginationConfig;
  onChange?: (params: TableOnChangeParams) => void;
}

const SupersetTable = forwardRef<HTMLDivElement, TableProps>(
  ({ columns, data, loading, pagination, onChange }, ref) => {
    const [order, setOrder] = useState<'asc' | 'desc'>('asc');
    const [orderBy, setOrderBy] = useState<string>('');

    const handleSort = (columnKey: string) => {
      const isAsc = orderBy === columnKey && order === 'asc';
      const newOrder = isAsc ? 'desc' : 'asc';
      setOrder(newOrder);
      setOrderBy(columnKey);
      onChange?.({
        pagination: {
          pageSize: pagination?.pageSize ?? 10,
          current: pagination?.current ?? 1,
        },
        sorter: { columnKey, order: newOrder },
      });
    };

    const handleChangePage = (_event: unknown, newPage: number) => {
      onChange?.({
        pagination: { pageSize: pagination?.pageSize ?? 10, current: newPage + 1 },
        sorter: orderBy ? { columnKey: orderBy, order } : undefined,
      });
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.({
        pagination: { pageSize: parseInt(event.target.value, 10), current: 1 },
        sorter: orderBy ? { columnKey: orderBy, order } : undefined,
      });
    };

    return (
      <Box ref={ref} sx={{ position: 'relative' }}>
        <MuiTableContainer>
          <MuiTable>
            <MuiTableHead>
              <MuiTableRow>
                {columns.map(col => (
                  <MuiTableCell key={col.key}>
                    {col.sortable ? (
                      <MuiTableSortLabel
                        active={orderBy === col.key}
                        direction={orderBy === col.key ? order : 'asc'}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.title}
                      </MuiTableSortLabel>
                    ) : (
                      col.title
                    )}
                  </MuiTableCell>
                ))}
              </MuiTableRow>
            </MuiTableHead>
            <MuiTableBody>
              {data.map((row, rowIndex) => (
                <MuiTableRow key={rowIndex}>
                  {columns.map(col => {
                    const value = col.dataIndex ? row[col.dataIndex] : undefined;
                    return (
                      <MuiTableCell key={col.key}>
                        {col.render ? col.render(value, row, rowIndex) : (value as ReactNode)}
                      </MuiTableCell>
                    );
                  })}
                </MuiTableRow>
              ))}
            </MuiTableBody>
          </MuiTable>
        </MuiTableContainer>
        {pagination && (
          <MuiTablePagination
            component="div"
            count={pagination.total}
            page={pagination.current - 1}
            rowsPerPage={pagination.pageSize}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 20, 50]}
          />
        )}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              zIndex: 1,
            }}
          >
            <MuiCircularProgress />
          </Box>
        )}
      </Box>
    );
  },
);

SupersetTable.displayName = 'SupersetTable';

export default SupersetTable;
