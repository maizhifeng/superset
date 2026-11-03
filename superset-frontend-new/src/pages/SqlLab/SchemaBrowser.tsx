import {
  memo,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import TableChartIcon from "@mui/icons-material/TableChart";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import StorageIcon from "@mui/icons-material/Storage";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import RefreshIcon from "@mui/icons-material/Refresh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNotificationStore } from "@/store/notificationStore";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import type { Database } from "@/types/api";

interface SchemaBrowserProps {
  databases: Database[];
  databaseId: number | "";
  schemas: string[];
  schema: string;
  schemasLoading: boolean;
  tableList: { value: string; type: string }[];
  columnCache: Record<string, Record<string, string[]>>;
  loadingTable: string | null;
  sidebarOpen: boolean;
  onDatabaseChange: (id: number) => void;
  onSchemaChange: (s: string) => void;
  onToggleSidebar: () => void;
  onTableExpand: (tableName: string) => void;
  onTableContextMenu: (e: React.MouseEvent, table: string) => void;
  onColumnContextMenu: (
    e: React.MouseEvent,
    table: string,
    column: string,
  ) => void;
  /** 手动刷新表与列元数据。 */
  onRefresh: () => void;
}

interface BrowserEmptyStateProps {
  icon: ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** 浏览器内的轻量空态：图标 + 说明 + 可选的真实操作按钮（绝不使用伪按钮）。 */
function BrowserEmptyState({
  icon,
  message,
  actionLabel,
  onAction,
}: BrowserEmptyStateProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        px: 1.5,
        py: 2,
        textAlign: "center",
        borderRadius: 1.5,
        border: "1px dashed",
        borderColor: "divider",
        bgcolor: "bg.muted",
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          color: "text.disabled",
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ lineHeight: 1.5 }}
      >
        {message}
      </Typography>
      {actionLabel && onAction && (
        <Button
          size="small"
          variant="text"
          startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={onAction}
          aria-label={actionLabel}
          sx={{
            textTransform: "none",
            fontSize: "0.75rem",
            minHeight: 0,
            py: 0.25,
          }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

/**
 * 空列数组常量：保证"尚未加载列"的表在 memo 比较时拿到稳定引用，
 * 避免整棵树因每次新建空数组而被反复重建。
 */
const EMPTY_COLUMNS: string[] = [];
const EMPTY_SCHEMA_COLUMNS: Record<string, string[]> = {};

interface TableTreeItemProps {
  table: { value: string; type: string };
  columns: string[];
  /** 该表的列元数据是否已加载（undefined 表示尚未加载）。 */
  columnsLoaded: boolean;
  columnSearch: string;
  loading: boolean;
  onTableContextMenu: (event: ReactMouseEvent, table: string) => void;
  onColumnContextMenu: (
    event: ReactMouseEvent,
    table: string,
    column: string,
  ) => void;
}

/**
 * 单张表的树节点。表数量可达上千张，memo 化后展开单表 / 加载某表列 /
 * 切换加载态时只需重建发生变化的节点，而不是整棵树。
 */
const TableTreeItem = memo(function TableTreeItem({
  table,
  columns,
  columnsLoaded,
  columnSearch,
  loading,
  onTableContextMenu,
  onColumnContextMenu,
}: TableTreeItemProps) {
  const visibleColumns = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    return q ? columns.filter((c) => c.toLowerCase().includes(q)) : columns;
  }, [columns, columnSearch]);

  return (
    <TreeItem
      itemId={table.value}
      label={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
          }}
        >
          <TableChartIcon
            sx={{
              fontSize: 15,
              color: table.type === "view" ? "warning.main" : "primary.main",
            }}
          />
          <Typography variant="body2">{table.value}</Typography>
          {visibleColumns.length > 0 && (
            <Typography variant="caption" color="text.disabled">
              {visibleColumns.length} 列
            </Typography>
          )}
          {loading && <CircularProgress size={12} sx={{ ml: 0.5 }} />}
        </Box>
      }
      onContextMenu={(e) => {
        e.preventDefault();
        onTableContextMenu(e, table.value);
      }}
    >
      {columnsLoaded ? (
        visibleColumns.map((col) => (
          <TreeItem
            key={col}
            itemId={`${table.value}.${col}`}
            label={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                <ViewColumnIcon
                  sx={{ fontSize: 14, color: "text.secondary" }}
                />
                <Typography variant="caption">{col}</Typography>
              </Box>
            }
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onColumnContextMenu(e, table.value, col);
            }}
          />
        ))
      ) : (
        // 列元数据按需加载：先给一个占位子节点，树节点才可展开并触发
        // onItemExpansionToggle → onTableExpand 去拉取该表列信息。
        <TreeItem
          key="__loading"
          itemId={`${table.value}.__loading`}
          disabled
          label={
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                color: "text.secondary",
              }}
            >
              <CircularProgress size={12} />
              <Typography variant="caption">正在加载列…</Typography>
            </Box>
          }
        />
      )}
    </TreeItem>
  );
});

function SchemaBrowser({
  databases,
  databaseId,
  schemas,
  schema,
  schemasLoading,
  tableList,
  columnCache,
  loadingTable,
  sidebarOpen,
  onDatabaseChange,
  onSchemaChange,
  onToggleSidebar,
  onTableExpand,
  onTableContextMenu,
  onColumnContextMenu,
  onRefresh,
}: SchemaBrowserProps) {
  const [tableSearch, setTableSearch] = useState("");
  const [columnSearch, setColumnSearch] = useState("");
  const notify = useNotificationStore((s) => s.notify);

  /** 复制当前选中数据库的名称。 */
  const copyDbName = async () => {
    const db = databases.find((d) => d.id === databaseId);
    if (!db) return;
    try {
      await navigator.clipboard.writeText(db.database_name);
      notify({ severity: "success", message: "已复制数据库名" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制当前选中的模式名。 */
  const copySchemaName = async () => {
    if (!schema) return;
    try {
      await navigator.clipboard.writeText(schema);
      notify({ severity: "success", message: `已复制模式名 ${schema}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  const tableSearchTerm = tableSearch.trim().toLowerCase();
  // 1035 张表时逐键过滤本身也有成本：仅在表列表或搜索词真正变化时重算。
  const filteredTables = useMemo(
    () =>
      tableList.filter((t) => t.value.toLowerCase().includes(tableSearchTerm)),
    [tableList, tableSearchTerm],
  );
  // 当前模式的列缓存；未加载的表用稳定空对象/空数组占位，避免 memo 失效。
  const schemaColumns = columnCache[schema] ?? EMPTY_SCHEMA_COLUMNS;
  if (!sidebarOpen) {
    return (
      <Paper
        sx={{
          width: 40,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 1,
          // notion 主题下页面与 Paper 同为白色且 Paper 无阴影，收起后的侧栏
          // 会完全融进背景；用主题化的 surface 底色 + 分隔边框保证可见。
          bgcolor: "surface.main",
          borderRight: "1px solid",
          borderColor: "divider",
        }}
      >
        <Tooltip title="显示浏览器" placement="right">
          <IconButton
            size="small"
            aria-label="显示数据库浏览器"
            onClick={onToggleSidebar}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        width: 260,
        flexShrink: 0,
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflow: "hidden",
        // 与收起态一致：notion 主题下白色 Paper 贴在白色页面上没有边界，
        // 这里统一使用主题化的 surface 底色 + 分隔边框，两种主题都清晰可辨。
        bgcolor: "surface.main",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          数据库浏览器
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Tooltip title="刷新数据库与表">
            <IconButton size="small" onClick={onRefresh}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            aria-label="隐藏数据库浏览器"
            onClick={onToggleSidebar}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600 }}
        >
          数据库
        </Typography>
        {databaseId !== "" && (
          <Tooltip title="复制数据库名">
            <IconButton size="small" onClick={() => void copyDbName()}>
              <ContentCopyIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <FormControl size="small" fullWidth>
        <InputLabel id="db-label">数据库</InputLabel>
        <Select
          labelId="db-label"
          label="数据库"
          value={databaseId}
          onChange={(e) => onDatabaseChange(e.target.value)}
        >
          {databases.map((db) => (
            <MenuItem key={db.id} value={db.id}>
              {db.database_name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {databaseId === "" ? (
        <BrowserEmptyState
          icon={<StorageIcon sx={{ fontSize: 18 }} />}
          message={
            databases.length === 0
              ? "暂无可用数据库，请刷新重试"
              : "选择数据库后可浏览模式与数据表"
          }
          actionLabel="刷新列表"
          onAction={onRefresh}
        />
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              模式
            </Typography>
            {schema && (
              <Tooltip title="复制模式名">
                <IconButton size="small" onClick={() => void copySchemaName()}>
                  <ContentCopyIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel id="schema-label">模式</InputLabel>
            <Select
              labelId="schema-label"
              label="模式"
              value={schema}
              onChange={(e) => onSchemaChange(e.target.value)}
              disabled={schemasLoading}
            >
              {schemas.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {schemasLoading && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 0.5,
                py: 0.5,
                color: "text.secondary",
              }}
            >
              <CircularProgress size={12} />
              <Typography variant="caption">正在加载模式…</Typography>
            </Box>
          )}
          {!schemasLoading && schemas.length === 0 && (
            <BrowserEmptyState
              icon={<StorageIcon sx={{ fontSize: 18 }} />}
              message="该数据库下未发现可用模式"
              actionLabel="刷新"
              onAction={onRefresh}
            />
          )}
          {!schemasLoading && schemas.length > 0 && !schema && (
            <BrowserEmptyState
              icon={<TableChartIcon sx={{ fontSize: 18 }} />}
              message="选择模式后可浏览该模式下的数据表"
            />
          )}
        </>
      )}
      {databaseId !== "" && !schemasLoading && schemas.length > 0 && schema && (
        <>
          <Divider />
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, px: 0.5 }}
            >
              表
            </Typography>
            {tableList.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                {filteredTables.length}/{tableList.length}
              </Typography>
            )}
          </Box>
          <TextField
            size="small"
            fullWidth
            placeholder="搜索表..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            sx={{
              px: 0.5,
              "& .MuiOutlinedInput-root": { fontSize: "0.75rem" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{ fontSize: 14, color: "text.secondary" }}
                    />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            size="small"
            fullWidth
            placeholder="搜索列..."
            value={columnSearch}
            onChange={(e) => setColumnSearch(e.target.value)}
            sx={{
              px: 0.5,
              mt: 0.5,
              "& .MuiOutlinedInput-root": { fontSize: "0.75rem" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <ViewColumnIcon
                      sx={{ fontSize: 14, color: "text.secondary" }}
                    />
                  </InputAdornment>
                ),
              },
            }}
          />
          {filteredTables.length === 0 ? (
            <BrowserEmptyState
              icon={<TableChartIcon sx={{ fontSize: 18 }} />}
              message={tableSearch ? "没有匹配的表" : "该模式下暂无数据表"}
              actionLabel={tableSearch ? undefined : "刷新"}
              onAction={tableSearch ? undefined : onRefresh}
            />
          ) : (
            <SimpleTreeView
              sx={{ flex: 1, overflow: "auto" }}
              onItemExpansionToggle={(_, itemId, isExpanded) => {
                if (isExpanded) onTableExpand(itemId);
              }}
            >
              {filteredTables.map((t) => (
                <TableTreeItem
                  key={t.value}
                  table={t}
                  columns={schemaColumns[t.value] ?? EMPTY_COLUMNS}
                  columnsLoaded={schemaColumns[t.value] !== undefined}
                  columnSearch={columnSearch}
                  loading={loadingTable === t.value}
                  onTableContextMenu={onTableContextMenu}
                  onColumnContextMenu={onColumnContextMenu}
                />
              ))}
            </SimpleTreeView>
          )}
        </>
      )}
    </Paper>
  );
}

/**
 * memo 化：桌面端打字只会改动 SQL state，与浏览器无关；props 引用稳定时
 * 直接跳过 1035 节点子树的协调与渲染（此前每次按键都整树重建）。
 */
export default memo(SchemaBrowser);
