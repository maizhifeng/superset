import { type SxProps, type Theme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

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

export default function DataPreviewTable({
  data, maxRows = 100, formatCell: formatter, sx,
}: DataPreviewTableProps) {
  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];

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
            {keys.map(k => (
              <TableCell key={k} sx={{ fontWeight: 600 }}>{k}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, maxRows).map((row, i) => (
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
