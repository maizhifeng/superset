import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
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
  onColumnContextMenu: (e: React.MouseEvent, table: string, column: string) => void;
}

export default function SchemaBrowser({
  databases, databaseId, schemas, schema, schemasLoading, tableList,
  columnCache, loadingTable, sidebarOpen,
  onDatabaseChange, onSchemaChange, onToggleSidebar,
  onTableExpand, onTableContextMenu, onColumnContextMenu,
}: SchemaBrowserProps) {
  if (!sidebarOpen) {
    return (
      <Paper sx={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", py: 1, mr: 2 }}>
        <Tooltip title="显示浏览器" placement="right">
          <IconButton size="small" onClick={onToggleSidebar}><ChevronRightIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Paper>
    );
  }

  return (
    <Paper sx={{ width: 260, flexShrink: 0, p: 2, display: "flex", flexDirection: "column", gap: 2, overflow: "hidden", mr: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>数据库浏览器</Typography>
        <IconButton size="small" onClick={onToggleSidebar}><ChevronLeftIcon fontSize="small" /></IconButton>
      </Box>
      <FormControl size="small" fullWidth>
        <InputLabel id="db-label">数据库</InputLabel>
        <Select labelId="db-label" label="数据库" value={databaseId} onChange={(e) => onDatabaseChange(e.target.value as number)}>
          {databases.map((db) => <MenuItem key={db.id} value={db.id}>{db.database_name}</MenuItem>)}
        </Select>
      </FormControl>
      {databaseId !== "" && (
        <FormControl size="small" fullWidth>
          <InputLabel id="schema-label">模式</InputLabel>
          <Select labelId="schema-label" label="模式" value={schema} onChange={(e) => onSchemaChange(e.target.value)} disabled={schemasLoading}>
            {schemas.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      )}
      {schema && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, px: 0.5 }}>表</Typography>
          {tableList.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ px: 0.5 }}>暂无表</Typography>
          ) : (
            <SimpleTreeView sx={{ flex: 1, overflow: "auto" }} onItemExpansionToggle={(_, itemId, isExpanded) => { if (isExpanded) onTableExpand(itemId); }}>
              {tableList.map((t) => {
                const cols = columnCache[schema]?.[t.value] ?? [];
                const isLoading = loadingTable === t.value;
                return (
                  <TreeItem key={t.value} itemId={t.value}
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <TableChartIcon sx={{ fontSize: 15, color: t.type === "view" ? "warning.main" : "primary.main" }} />
                        <Typography variant="body2">{t.value}</Typography>
                        {isLoading && <CircularProgress size={12} sx={{ ml: 0.5 }} />}
                      </Box>
                    }
                    onContextMenu={(e) => { e.preventDefault(); onTableContextMenu(e, t.value); }}
                  >
                    {cols.map((col) => (
                      <TreeItem key={col} itemId={`${t.value}.${col}`}
                        label={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                            <ViewColumnIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                            <Typography variant="caption">{col}</Typography>
                          </Box>
                        }
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onColumnContextMenu(e, t.value, col); }}
                      />
                    ))}
                  </TreeItem>
                );
              })}
            </SimpleTreeView>
          )}
        </>
      )}
    </Paper>
  );
}
