import { useState, useMemo } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';

export type CellFormatter = (key: string, value: unknown) => string;

interface DataPreviewTableProps {
  data: { data?: unknown } | undefined | null;
  maxRows?: number;
  formatCell?: CellFormatter;
  sx?: SxProps<Theme>;
}

function defaultFormat(_key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function formatCell(key: string, value: unknown, formatter?: CellFormatter): string {
  if (formatter) return formatter(key, value);
  return defaultFormat(key, value);
}

type SortDirection = 'desc' | 'asc';

interface SortEntry {
  column: string;
  direction: SortDirection;
  locked: boolean;
}

export default function DataPreviewTable({
  data, maxRows = 100, formatCell: formatter, sx,
}: DataPreviewTableProps) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);

  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];

  const sortedRows = useMemo(() => {
    if (sorts.length === 0 || rows.length === 0) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      for (const s of sorts) {
        const va = a[s.column];
        const vb = b[s.column];
        if (va == null && vb == null) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        let cmp: number;
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        if (cmp !== 0) return s.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
    return sorted;
  }, [rows, sorts]);

  const handleHeaderClick = (key: string) => {
    setSorts(prev => {
      const idx = prev.findIndex(s => s.column === key);
      if (idx >= 0) {
        if (prev[idx].direction === 'desc') {
          const next = [...prev];
          next[idx] = { ...next[idx], direction: 'asc' };
          return next;
        }
        return prev.filter(s => s.column !== key);
      }
      const lastLocked = prev.reduce((last, s, i) => s.locked ? i : last, -1);
      if (lastLocked >= 0) {
        const next = [...prev];
        next.splice(lastLocked + 1, 0, { column: key, direction: 'desc', locked: false });
        return next;
      }
      return [{ column: key, direction: 'desc', locked: false }];
    });
  };

  const handleLockToggle = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setSorts(prev => prev.map(s =>
      s.column === key ? { ...s, locked: !s.locked } : s,
    ));
  };

  if (rows.length === 0) {
    return (
      <TableContainer sx={{ flex: 1, ...(sx as object) }}>
        <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1, fontSize: '0.75rem' } }}>
          <TableHead>
            <TableRow>
              <TableCell align="center" colSpan={keys.length || 1}>
                <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: 'block' }}>
                  No data
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
      </TableContainer>
    );
  }

  return (
    <TableContainer sx={{ flex: 1, ...(sx as object) }}>
      <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1, fontSize: '0.75rem' } }}>
        <TableHead>
          <TableRow>
            {keys.map(k => {
              const sortEntry = sorts.find(s => s.column === k);
              const sortIdx = sortEntry ? sorts.indexOf(sortEntry) : -1;
              return (
                <TableCell
                  key={k}
                  onClick={() => handleHeaderClick(k)}
                  sx={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                    {k}
                    {sortEntry ? (
                      sortEntry.direction === 'desc' ? (
                        <ArrowDownwardIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                      ) : (
                        <ArrowUpwardIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                      )
                    ) : (
                      <UnfoldMoreIcon sx={{ fontSize: 14, color: 'action.disabled', opacity: 0.4 }} />
                    )}
                    {sortEntry && (
                      <Box
                        component="span"
                        onClick={e => handleLockToggle(e, k)}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          color: sortEntry.locked ? 'primary.main' : 'action.disabled',
                          opacity: sortEntry.locked ? 1 : 0.35,
                          '&:hover': { opacity: 1, color: 'primary.main' },
                        }}
                      >
                        {sortEntry.locked
                          ? <LockIcon sx={{ fontSize: 12 }} />
                          : <LockOpenIcon sx={{ fontSize: 12 }} />}
                      </Box>
                    )}
                    {sortEntry?.locked && (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{
                          fontSize: '0.55rem',
                          fontWeight: 800,
                          color: 'primary.main',
                          lineHeight: 1,
                          ml: 0.1,
                        }}
                      >
                        {sortIdx + 1}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedRows.slice(0, maxRows).map((row, i) => (
            <TableRow key={i}>
              {keys.map(k => (
                <TableCell key={k}>{formatCell(k, row[k], formatter)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
