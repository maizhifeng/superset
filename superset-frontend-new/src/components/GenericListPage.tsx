import type { ReactNode } from "react";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import ListPageLayout from "@/components/ListPageLayout";
import { usePaginatedList } from "@/hooks/usePaginatedList";

export interface ListPageConfig<T> {
  title: string;
  endpoint: string;
  columns: GridColDef[];
  filterColumn: string;
  emptyTitle: string;
  emptyDescription: string;
  fabLabel?: string;
  fabIcon?: ReactNode;
  onCreateClick?: () => void;
  deleteEndpoint?: string;
  deleteConfirmMessage?: string;
  renderCard?: (row: T) => ReactNode;
  pageSize?: number;
}

export function GenericListPage<T extends { id: number }>({
  title,
  endpoint,
  columns,
  filterColumn,
  emptyTitle,
  emptyDescription,
  renderCard,
}: ListPageConfig<T>) {
  const { rows, rowCount, loading, error, searchText } = usePaginatedList<T>({
    endpoint, filterColumn, pageSize: 50, errorMessage: `加载${title}失败`,
  });

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyState={
        <>
          <EmptyState title={emptyTitle} description={searchText ? "请调整搜索条件" : emptyDescription} />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <ResponsiveDataGrid rows={rows} columns={columns} loading={loading}
        paginationMode="server" rowCount={rowCount}
        renderCard={renderCard as ((row: Record<string, unknown>) => ReactNode) | undefined} />
    </ListPageLayout>
  );
}
