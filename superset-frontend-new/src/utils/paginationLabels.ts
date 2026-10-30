/**
 * Chinese labels shared by the MUI ``TablePagination`` footers.
 *
 * The app ships a Chinese-only UI, so the pagination footer must not fall back
 * to MUI's English defaults ("Rows per page", "1–10 of 10").
 */
export const tablePaginationLabels = {
  labelRowsPerPage: "每页行数：",
  labelDisplayedRows: ({
    from,
    to,
    count,
  }: {
    from: number;
    to: number;
    count: number;
  }) => `${from}–${to} 共 ${count} 条`,
} as const;

export default tablePaginationLabels;
