import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import type { QueryResult } from "@/types/api";

interface ResultsTableProps {
  result: QueryResult;
  page: number;
  rowsPerPage: number;
  paginatedData: Record<string, unknown>[];
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
}

export default function ResultsTable({
  result,
  page,
  rowsPerPage,
  paginatedData,
  onPageChange,
  onRowsPerPageChange,
}: ResultsTableProps) {
  return (
    <Box
      sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}
      >
        <Typography variant="body2" color="text.secondary">
          {result.data.length} 行
          {result.query_id ? ` · query #${result.query_id}` : ""}
          {result.query?.queryId
            ? ` · server query #${result.query.queryId}`
            : ""}
          {result.query?.state ? ` · ${result.query.state}` : ""}
        </Typography>
      </Box>
      <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, mt: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {result.columns.map((col) => (
                <TableCell
                  key={col.name}
                  sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                >
                  {col.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={result.columns.length}
                  sx={{ textAlign: "center", py: 4, color: "text.secondary" }}
                >
                  无数据
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map((col) => (
                    <TableCell
                      key={col.name}
                      sx={{
                        fontSize: "0.75rem",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(row[col.name] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={result.data.length}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          onRowsPerPageChange(parseInt(e.target.value, 10));
          onPageChange(0);
        }}
        rowsPerPageOptions={[25, 50, 100, 500]}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  );
}
