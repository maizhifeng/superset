// ============================================================
// 数据源配置页面 - 管理多个数据库连接
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbAPI } from '../api';
import { useDBStore } from '../store';
import { PageWrapper, PageHeader } from '@/components/layouts';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button as MuiButton,
  Alert,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Collapse,
  Tooltip,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  TablePagination,
} from '@mui/material';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import StorageIcon from '@mui/icons-material/Storage';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TableChartIcon from '@mui/icons-material/TableChart';

const defaultForm = {
  name: '',
  host: 'localhost',
  port: 5432,
  database: '',
  user: 'postgres',
  password: '',
};

export default function DBConfig() {
  const queryClient = useQueryClient();
  const {
    connections, activeConnection, connected, tables,
    setConnections, setActiveConnection, setTables,
    addConnection, updateConnection, removeConnection,
  } = useDBStore();

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [testedTables, setTestedTables] = useState([]);
  const [allowedTables, setAllowedTables] = useState(null);
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testDebug, setTestDebug] = useState(null);

  // 加载已保存的连接
  const { data: connData } = useQuery({
    queryKey: ['db-connections'],
    queryFn: dbAPI.getConnections,
  });

  useEffect(() => {
    if (connData?.data) {
      setConnections(connData.data);
      if (connData.activeId && !activeConnection) {
        const active = connData.data.find(c => c.id === connData.activeId);
        if (active) setActiveConnection(active);
      }
    }
  }, [connData]);

  // 连接后加载数据表
  const { data: tablesData } = useQuery({
    queryKey: ['tables'],
    queryFn: dbAPI.getTables,
    enabled: connected,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (tablesData?.data) setTables(tablesData.data);
  }, [tablesData]);

  // 数据变更操作
  const testMutation = useMutation({
    mutationFn: dbAPI.testConnectionWithTables,
    onSuccess: (data) => {
      setTestedTables(data.data.tables);
      setTestDebug(data.data.debug || null);
      setTestSuccessful(true);
      if (data.data.tables.length === 0 && data.data.debug) {
        const d = data.data.debug;
        setMessage({
          type: 'error',
          text: `连接成功但未找到数据表。数据库中共 ${d.all_tables_count} 张表（含系统表），${d.user_tables_count} 张用户表，${d.filtered_tables_count} 张符合过滤条件。可用 schema: ${(d.all_schemas || []).join(', ')}`,
        });
      } else {
        setMessage({ type: 'success', text: `连接成功！共发现 ${data.data.tables.length} 张数据表` });
      }
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const saveMutation = useMutation({
    mutationFn: dbAPI.saveConnection,
    onSuccess: (data) => {
      addConnection(data.data);
      setActiveConnection(data.data);
      setSelectedId(data.data.id);
      setShowForm(false);
      setEditingId(null);
      setTestedTables([]);
      setAllowedTables(null);
      setTestSuccessful(false);
      setMessage({ type: 'success', text: '连接已保存并激活' });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, config }) => dbAPI.updateConnection(id, config),
    onSuccess: (data) => {
      updateConnection(data.data.id, data.data);
      if (activeConnection?.id === data.data.id) setActiveConnection(data.data);
      setShowForm(false);
      setEditingId(null);
      setTestedTables([]);
      setAllowedTables(null);
      setTestSuccessful(false);
      setMessage({ type: 'success', text: '连接已更新' });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: dbAPI.deleteConnection,
    onSuccess: (_, id) => {
      removeConnection(id);
      if (selectedId === id) setSelectedId(null);
      if (activeConnection?.id === id) setActiveConnection(null);
      setMessage({ type: 'success', text: '连接已删除' });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const activateMutation = useMutation({
    mutationFn: dbAPI.activateConnection,
    onSuccess: (_, id) => {
      const conn = connections.find(c => c.id === id);
      if (conn) setActiveConnection(conn);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const handleSelect = (conn) => {
    setSelectedId(conn.id);
    setShowForm(false);
    setEditingId(null);
    setForm({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: '',
    });
    setTestedTables([]);
    setTestDebug(null);
    setAllowedTables(null);
    setTestSuccessful(false);
  };

  const handleNew = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(true);
    setMessage(null);
    setTestedTables([]);
    setTestDebug(null);
    setAllowedTables(null);
    setTestSuccessful(false);
  };

  const handleEdit = () => {
    const conn = connections.find(c => c.id === selectedId);
    if (!conn) return;
    setForm({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: '',
    });
    setEditingId(conn.id);
    setShowForm(true);
    setMessage(null);
    setTestedTables([]);
    setTestDebug(null);
    setAllowedTables(conn.allowedTables || null);
    setTestSuccessful(false);
  };

  const handleSubmit = () => {
    setMessage(null);
    const payload = { ...form, allowedTables };
    if (editingId) {
      updateMutation.mutate({ id: editingId, config: payload });
    } else {
      saveMutation.mutate(payload);
    }
  };

  const handleTest = () => {
    setMessage(null);
    setTestedTables([]);
    setTestDebug(null);
    setTestSuccessful(false);
    testMutation.mutate(form);
  };

  const handleActivate = (id) => {
    setMessage(null);
    activateMutation.mutate(id);
  };

  const handleDelete = (id) => {
    if (confirm('确定删除此连接？')) {
      deleteMutation.mutate(id);
    }
  };

  const isActive = (id) => activeConnection?.id === id;

  const pending = saveMutation.isPending || updateMutation.isPending || testMutation.isPending;

  return (
    <PageWrapper maxWidth="lg">
      <PageHeader title="数据源管理" subtitle="管理多个数据库连接" />

      {message && (
        <Alert severity={message.type === 'success' ? 'success' : 'error'} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2 }}>
        {/* ====== 左侧：连接列表 ====== */}
        <Paper elevation={0} sx={{ width: 280, flexShrink: 0, borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2">已保存的连接</Typography>
            <IconButton size="small" onClick={handleNew}>
              <AddIcon sx={{ width: 18, height: 18 }} />
            </IconButton>
          </Box>
          <List dense disablePadding>
            {connections.length === 0 ? (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">暂无保存的连接</Typography>
                <MuiButton size="small" startIcon={<AddIcon />} onClick={handleNew} sx={{ mt: 1 }}>
                  新增连接
                </MuiButton>
              </Box>
            ) : (
              connections.map((c) => (
                <ListItemButton
                  key={c.id}
                  selected={selectedId === c.id}
                  onClick={() => handleSelect(c)}
                  sx={{ borderLeft: isActive(c.id) ? '3px solid' : '3px solid transparent', borderLeftColor: isActive(c.id) ? 'primary.main' : 'transparent', minWidth: 0 }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <StorageIcon sx={{ width: 16, height: 16, color: isActive(c.id) ? 'primary.main' : 'text.secondary' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.name}
                    secondary={`${c.user}@${c.host}:${c.port}/${c.database}`}
                    slotProps={{
                      primary: { variant: 'body2', noWrap: true },
                      secondary: { variant: 'caption', noWrap: true },
                    }}
                    sx={{ overflow: 'hidden' }}
                  />
                  {isActive(c.id) && (
                    <Chip label="活跃" size="small" color="primary" sx={{ ml: 0.5, height: 20, fontSize: 10 }} />
                  )}
                </ListItemButton>
              ))
            )}
          </List>
        </Paper>

        {/* ====== 右侧：详情面板 ====== */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 连接详情 / 表单 */}
          {(showForm || selectedId) && (
            <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2">
                  {showForm ? (editingId ? '编辑连接' : '新增连接') : '连接详情'}
                </Typography>
                {!showForm && selectedId && (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {!isActive(selectedId) && (
                      <MuiButton size="small" variant="outlined" startIcon={<PlayArrowIcon sx={{ width: 14, height: 14 }} />} onClick={() => handleActivate(selectedId)}>
                        切换
                      </MuiButton>
                    )}
                    <MuiButton size="small" variant="outlined" startIcon={<EditIcon sx={{ width: 14, height: 14 }} />} onClick={handleEdit}>
                      编辑
                    </MuiButton>
                    <MuiButton size="small" variant="outlined" color="error" startIcon={<DeleteIcon sx={{ width: 14, height: 14 }} />} onClick={() => handleDelete(selectedId)}>
                      删除
                    </MuiButton>
                  </Box>
                )}
              </Box>

              {(showForm || editingId) ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <TextField label="连接名称" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} size="small" fullWidth />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 1.5 }}>
                    <TextField label="Host" value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} size="small" fullWidth />
                    <TextField label="Port" type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: e.target.value }))} size="small" fullWidth />
                  </Box>
                  <TextField label="Database" value={form.database} onChange={(e) => setForm(f => ({ ...f, database: e.target.value }))} size="small" fullWidth />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField label="User" value={form.user} onChange={(e) => setForm(f => ({ ...f, user: e.target.value }))} size="small" fullWidth />
                    <TextField label="Password" type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} size="small" fullWidth />
                  </Box>

                  {testSuccessful && (
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TableChartIcon sx={{ width: 16, height: 16 }} />
                          选择数据表
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {testedTables.length === 0
                            ? '未找到数据表'
                            : allowedTables === null
                              ? `全部 ${testedTables.length} 张表`
                              : `已选 ${allowedTables.length}/${testedTables.length} 张表`
                          }
                        </Typography>
                      </Box>
                      {testedTables.length > 0 && (
                        <>
                          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <MuiButton size="small" variant="outlined" onClick={() => setAllowedTables(null)} sx={{ fontSize: 11, py: 0.25 }}>
                              全选
                            </MuiButton>
                            <MuiButton size="small" variant="outlined" onClick={() => setAllowedTables([])} sx={{ fontSize: 11, py: 0.25 }}>
                              取消全选
                            </MuiButton>
                          </Box>
                          <TableTreeView
                            tables={testedTables}
                            allowedTables={allowedTables}
                            onToggle={setAllowedTables}
                          />
                        </>
                      )}
                      {testedTables.length === 0 && testDebug && (
                        <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                          <Typography variant="caption" component="div" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', bgcolor: 'grey.50', p: 1, borderRadius: 1 }}>
                            {`数据库统计:
  全部表: ${testDebug.all_tables_count}
  用户表: ${testDebug.user_tables_count}
  过滤后: ${testDebug.filtered_tables_count}
  Schema: ${(testDebug.all_schemas || []).join(', ')}

全部表清单:`}
                            {(testDebug.all_tables || []).map(t => `\n  [${t.type}] ${t.schema}.${t.name}`).join('')}
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <MuiButton variant="outlined" onClick={handleTest} disabled={pending} startIcon={<VisibilityIcon sx={{ width: 14, height: 14 }} />}>
                      {testMutation.isPending ? '测试中...' : '测试连接'}
                    </MuiButton>
                    <MuiButton variant="contained" onClick={handleSubmit} disabled={pending || !form.name || !form.host || !form.database}>
                      {saveMutation.isPending ? '保存中...' : editingId ? '保存修改' : '保存并连接'}
                    </MuiButton>
                    <MuiButton variant="text" onClick={() => { setShowForm(false); setEditingId(null); setTestedTables([]); setAllowedTables(null); setTestSuccessful(false); }}>取消</MuiButton>
                  </Box>
                </Box>
              ) : (
                selectedId && (() => {
                  const c = connections.find(x => x.id === selectedId);
                  if (!c) return null;
                  return (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: 13 }}>
                      <Box><Typography variant="caption" color="text.secondary">名称</Typography><Typography variant="body2">{c.name}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Host:Port</Typography><Typography variant="body2">{c.host}:{c.port}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Database</Typography><Typography variant="body2">{c.database}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">User</Typography><Typography variant="body2">{c.user}</Typography></Box>
                    </Box>
                  );
                })()
              )}
            </Paper>
          )}

          {/* 表浏览器 */}
          {connected && (
            <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ width: 16, height: 16, color: 'success.main' }} />
                <Typography variant="subtitle2">
                  {activeConnection?.database || '已连接'}
                </Typography>
                <Chip label="已连接" size="small" color="success" sx={{ ml: 1, height: 20, fontSize: 10 }} />
              </Box>
              <TableList />
            </Paper>
          )}

          {connections.length === 0 && !showForm && (
            <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', p: 3, textAlign: 'center' }}>
              <StorageIcon sx={{ width: 40, height: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">添加数据库连接以开始探索数据</Typography>
              <MuiButton variant="contained" startIcon={<AddIcon />} onClick={handleNew} sx={{ mt: 2 }}>
                新增连接
              </MuiButton>
            </Paper>
          )}
        </Box>
      </Box>
    </PageWrapper>
  );
}

const COLUMNS_PER_PAGE = 15;

function TableList() {
  const { tables, selectTable, activeConnection } = useDBStore();
  const [expandedTable, setExpandedTable] = useState(null);
  const [columns, setColumns] = useState([]);
  const [page, setPage] = useState(0);

  const handleExpand = async (table) => {
    const key = `${table.table_schema}.${table.table_name}`;
    if (expandedTable === key) {
      setExpandedTable(null);
      return;
    }
    try {
      const result = await dbAPI.getTableColumns(table.table_name, table.table_schema);
      setColumns(result?.data || []);
      setPage(0);
      setExpandedTable(key);
      selectTable(table.table_name, result.data);
    } catch {
      // 忽略错误
    }
  };

  const handleToggleDimension = async (col, qualifiedTable) => {
    const newVal = !col.is_dimension;
    const meta = {};
    for (const c of columns) {
      if (c.column_name === col.column_name) {
        meta[c.column_name] = { is_dimension: newVal, is_date: c.is_date };
      } else {
        meta[c.column_name] = { is_dimension: c.is_dimension, is_date: c.is_date };
      }
    }
    setColumns(columns.map(c => c.column_name === col.column_name ? { ...c, is_dimension: newVal } : c));
    if (activeConnection?.id) {
      await dbAPI.setFieldMeta(activeConnection.id, qualifiedTable, meta);
    }
  };

  const handleToggleDate = async (col, qualifiedTable) => {
    const newVal = !col.is_date;
    const meta = {};
    for (const c of columns) {
      if (c.column_name === col.column_name) {
        meta[c.column_name] = { is_dimension: c.is_dimension, is_date: newVal };
      } else {
        meta[c.column_name] = { is_dimension: c.is_dimension, is_date: c.is_date };
      }
    }
    setColumns(columns.map(c => c.column_name === col.column_name ? { ...c, is_date: newVal } : c));
    if (activeConnection?.id) {
      await dbAPI.setFieldMeta(activeConnection.id, qualifiedTable, meta);
    }
  };

  const handleChangePage = (_event, newPage) => {
    setPage(newPage);
  };

  const pagedColumns = columns.slice(page * COLUMNS_PER_PAGE, (page + 1) * COLUMNS_PER_PAGE);

  if (tables.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
        未发现数据表
      </Typography>
    );
  }

  return (
    <Box>
      {tables.map((table) => {
        const key = `${table.table_schema}.${table.table_name}`;
        const isOpen = expandedTable === key;
        return (
          <Box key={key} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box
              onClick={() => handleExpand(table)}
              sx={{
                px: 2, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', bgcolor: isOpen ? 'action.hover' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isOpen ? <KeyboardArrowDownIcon sx={{ width: 16, height: 16 }} /> : <KeyboardArrowRightIcon sx={{ width: 16, height: 16 }} />}
                <StorageIcon sx={{ width: 16, height: 16, color: 'text.secondary' }} />
                <Typography variant="body2">{table.table_name}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">{table.table_schema}</Typography>
            </Box>
            <Collapse in={isOpen}>
              {isOpen && columns.length > COLUMNS_PER_PAGE && (
                <TablePagination
                  component="div"
                  count={columns.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={COLUMNS_PER_PAGE}
                  rowsPerPageOptions={[COLUMNS_PER_PAGE]}
                  sx={{ '& .MuiTablePagination-toolbar': { minHeight: 36 }, '& .MuiTablePagination-spacer': { display: 'none' } }}
                />
              )}
              <Box sx={{ px: 2, pb: 1.5, bgcolor: 'background.paper' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><Typography variant="overline">Column</Typography></TableCell>
                      <TableCell><Typography variant="overline">Type</Typography></TableCell>
                      <TableCell><Typography variant="overline">标记</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedColumns.map(col => (
                      <TableRow key={col.column_name}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, py: 0.75 }}>{col.column_name}</TableCell>
                        <TableCell sx={{ py: 0.75 }}>
                          <Chip label={col.data_type} size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: 10, height: 20 }} />
                        </TableCell>
                        <TableCell sx={{ py: 0.75 }}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Chip
                              label="维度"
                              size="small"
                              color={col.is_dimension ? 'primary' : 'default'}
                              variant={col.is_dimension ? 'filled' : 'outlined'}
                              onClick={() => handleToggleDimension(col, key)}
                              sx={{ cursor: 'pointer', fontSize: 10, height: 20 }}
                            />
                            <Chip
                              label="日期"
                              size="small"
                              color={col.is_date ? 'info' : 'default'}
                              variant={col.is_date ? 'filled' : 'outlined'}
                              onClick={() => handleToggleDate(col, key)}
                              sx={{ cursor: 'pointer', fontSize: 10, height: 20 }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}

function TableTreeView({ tables, allowedTables, onToggle }) {
  const bySchema = useMemo(() => {
    const map = {};
    for (const t of tables) {
      const s = t.table_schema || 'public';
      if (!map[s]) map[s] = [];
      map[s].push(t);
    }
    return Object.entries(map);
  }, [tables]);

  const handleCheck = (qualifiedName, checked) => {
    if (allowedTables === null) {
      if (!checked) {
        const all = tables.map(x => `${x.table_schema}.${x.table_name}`);
        onToggle(all.filter(n => n !== qualifiedName));
      }
    } else if (checked) {
      onToggle([...allowedTables, qualifiedName]);
    } else {
      onToggle(allowedTables.filter(n => n !== qualifiedName));
    }
  };

  return (
    <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
      <SimpleTreeView
        defaultExpandedItems={bySchema.map(([s]) => s)}
        disableSelection
        sx={{ '& .MuiTreeItem-content': { py: 0.25 } }}
      >
        {bySchema.map(([schema, schemaTables]) => (
          <TreeItem
            key={schema}
            itemId={schema}
            label={<Typography variant="body2" fontWeight={600}>{schema}</Typography>}
          >
            {schemaTables.map(t => {
              const qualifiedName = `${t.table_schema}.${t.table_name}`;
              const checked = allowedTables === null || allowedTables.includes(qualifiedName);
              return (
                <TreeItem
                  key={qualifiedName}
                  itemId={qualifiedName}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Checkbox
                        size="small"
                        checked={checked}
                        onChange={(e) => handleCheck(qualifiedName, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ py: 0, '&.MuiCheckbox-root': { color: 'text.secondary' } }}
                      />
                      <Typography variant="body2">{t.table_name}</Typography>
                    </Box>
                  }
                />
              );
            })}
          </TreeItem>
        ))}
      </SimpleTreeView>
    </Box>
  );
}
