// ============================================================
// TableView — 数据表格视图组件
// 支持分组透视、排序、分页、列管理
// 可拖拽列宽、隐藏/显示字段与指标
// ============================================================

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, Typography, Pagination } from '@mui/material';
import { formatDisplayValue, formatByMetricFormat, formatDateLabelCompact, formatWeekRange, formatMonthLabel } from '@/utils/formatters';
import { Icon } from '@/components/ui/icon';
import ColumnManagementPanel from './ColumnManagementPanel';
import { usePivotGrouping } from '@/hooks/usePivotGrouping';

// 常量定义
const NUMERIC_DB_TYPES = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
const CELL_WIDTH = 60; // 用于粘性定位偏移计算的列宽估算值
const TREE_COLUMN = { name: '__tree__', type: 'tree' };

// 检测值是否为日期格式字符串
function isDateString(value) {
  if (!value || typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2} /.test(value);
}

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const DATE_OIDS = new Set([1082, 1083, 1114, 1184]);
const BOOL_OID = 16;

function inferFieldType(fieldName, fields, columns, sampleRows, dimensionNames) {
  if (dimensionNames?.has(fieldName)) return 'dimension';
  const fieldDef = fields?.find(f => f.name === fieldName);
  if (fieldDef) {
    if (NUMERIC_OIDS.has(fieldDef.type)) return 'metric';
    if (DATE_OIDS.has(fieldDef.type) || fieldDef.type === BOOL_OID) return 'dimension';
    if (fieldDef.type === 'number' || fieldDef.type === 'metric') return 'metric';
    if (fieldDef.type === 'string' || fieldDef.type === 'dimension' || fieldDef.type === 'date') return 'dimension';
  }

  const colDef = columns?.find(c => c.column_name === fieldName);
  if (colDef && NUMERIC_DB_TYPES.includes(colDef.data_type?.toLowerCase())) return 'metric';

  const sample = sampleRows?.find(r => r[fieldName] !== null && r[fieldName] !== undefined)?.[fieldName];
  return typeof sample === 'number' ? 'metric' : 'dimension';
}

function inferMetricAliasType(name, widgetMetrics, availableMetrics, columns) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const widgetMatch = widgetMetrics?.find(m => {
    const alias = (m.alias || `${m.func}_${m.field}`).toLowerCase();
    return alias === lower;
  });
  if (widgetMatch) return 'metric';
  const availMatch = availableMetrics?.find(m => {
    const agg = m.config?.aggregations?.[0];
    if (!agg) return false;
    const alias = (agg.alias || `${agg.func}_${agg.field}`).toLowerCase();
    return alias === lower;
  });
  if (availMatch) return 'metric';
  const sumMatch = lower.match(/^sum_(.+)$/);
  if (sumMatch) {
    const colName = sumMatch[1];
    if (columns?.some(c => c.column_name?.toLowerCase() === colName && NUMERIC_DB_TYPES.includes(c.data_type?.toLowerCase()))) {
      return 'metric';
    }
  }
  return null;
}

function buildFieldTypeMap(fields, columns, rows, dimensionNames) {
  const allNames = new Set([
    ...(fields?.map(f => f.name) || []),
    ...(columns?.map(c => c.column_name) || []),
    ...Object.keys(rows?.[0] || {}),
  ]);
  return Object.fromEntries([...allNames].map(name => [name, inferFieldType(name, fields, columns, rows, dimensionNames)]));
}

const TableView = React.memo(forwardRef(function TableView(props, ref) {
  const {
    fields,
    rows,
    columns,
    isLoading,
    visibleFields,
    availableMetrics,
    currentMetricIds,
    currentDimensions,
    onVisibleFieldsChange,
    onAddColumn,
    onAddMetric,
    isFullscreen,
    pendingVisibleFields,
    pendingMetricIds,
    pendingDimensions,
    onPendingChange,
    dateTrunc,
    dateField,
    metricNameMap = {},
    metricNameFormatMap = {},
    latestVisibleFields,
    widgetMetrics,
    totals,
  } = props;
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(100);
  const rowNumberRef = useRef(null);
  const [rowNumberWidth, setRowNumberWidth] = useState(CELL_WIDTH);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [hiddenDepths, setHiddenDepths] = useState(new Set());
  const [hiddenDimensionFields, setHiddenDimensionFields] = useState(new Set());

  useEffect(() => {
    setHiddenDimensionFields(new Set());
  }, [currentDimensions]);

  // 数据或分组变化时重置页码
  useEffect(() => { setPage(0); }, [rows, collapsedGroups, hiddenDepths]);

  // 更新行号列宽度（layout effect 确保在浏览器绘制前修正，消除闪动）
  useLayoutEffect(() => {
    if (rowNumberRef.current) {
      const w = rowNumberRef.current.offsetWidth;
      if (w !== rowNumberWidth) setRowNumberWidth(w);
    }
  });

  // 根据 dateTrunc 选择日期格式化器
  const dateFormatter = useMemo(() => {
    if (dateTrunc === 'week') return formatWeekRange;
    if (dateTrunc === 'month') return formatMonthLabel;
    return formatDateLabelCompact;
  }, [dateTrunc]);

  const displayedFieldNames = useMemo(() => {
    const names = fields?.map(f => f.name) || [];
    return names;
  }, [fields]);
  const dimensionNameSet = useMemo(() => new Set((currentDimensions || []).map(d => d.toLowerCase())), [currentDimensions]);
  const fieldTypeMap = useMemo(() => buildFieldTypeMap(fields, columns, rows, dimensionNameSet), [fields, columns, rows, dimensionNameSet]);

  const effectiveVisibleFields = (isFullscreen && pendingVisibleFields) ? pendingVisibleFields : visibleFields;

  const columnFieldNames = useMemo(() => (columns || []).map(c => c.column_name), [columns]);

  const optimisticVisibleFields = useMemo(() => {
    const source = (isFullscreen && pendingVisibleFields) ? pendingVisibleFields : (latestVisibleFields || effectiveVisibleFields);
    if (source?.length > 0) {
      const merged = [...source];
      if (currentDimensions) {
        for (const dim of currentDimensions) {
          if (!merged.includes(dim) && displayedFieldNames.includes(dim) && !hiddenDimensionFields.has(dim)) {
            merged.push(dim);
          }
        }
      }
      return merged;
    }
    return displayedFieldNames;
  }, [latestVisibleFields, effectiveVisibleFields, displayedFieldNames, currentDimensions, hiddenDimensionFields, isFullscreen, pendingVisibleFields]);

  const activeFields = useMemo(() => {
    const source = optimisticVisibleFields.length > 0 ? optimisticVisibleFields : effectiveVisibleFields;
    if (source?.length > 0) {
      const unique = [...new Set(source)];
      const typed = unique
        .map(name => ({ name, type: fieldTypeMap[name] || inferMetricAliasType(name, widgetMetrics, availableMetrics, columns) || 'dimension' }));
      if (displayedFieldNames.length === 0) return typed;
      return typed.filter(f => displayedFieldNames.includes(f.name) || (isFullscreen && effectiveVisibleFields.includes(f.name)));
    }
    const seen = new Set();
    return fields?.filter(f => { const ok = !seen.has(f.name); seen.add(f.name); return ok; }).map(f => ({ name: f.name, type: fieldTypeMap[f.name] || 'dimension' })) || [];
  }, [fields, optimisticVisibleFields, effectiveVisibleFields, displayedFieldNames, fieldTypeMap, isFullscreen, widgetMetrics, availableMetrics, columns]);

  const rawDimensionFields = useMemo(() => activeFields.filter(f => f.type === 'dimension'), [activeFields]);
  const rawMetricFields = useMemo(() => activeFields.filter(f => f.type === 'metric'), [activeFields]);

  const dimensionFields = rawDimensionFields.length >= 2
    ? [TREE_COLUMN]
    : rawDimensionFields;

  const metricFields = rawMetricFields;

  const numericFieldNames = useMemo(() => metricFields.map(f => f.name), [metricFields]);

  // 透视分组处理
  const { tree: pivotTree, flatRows: groupedFlatRows } = usePivotGrouping(
    rows,
    rawDimensionFields,
    rawMetricFields,
    collapsedGroups,
    hiddenDepths,
  );

  const toggleGroup = useCallback((groupKey) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // 计算每个维度列的粘性定位左偏移量
  const stickyOffsets = useMemo(() => {
    const offsets = { _row_number: 0 };
    dimensionFields.forEach((field, idx) => {
      const prevKey = idx === 0 ? '_row_number' : dimensionFields[idx - 1].name;
      offsets[field.name] = (offsets[prevKey] || 0) + (idx === 0 ? rowNumberWidth : CELL_WIDTH);
    });
    return offsets;
  }, [dimensionFields, rowNumberWidth]);

  const getCurrentPending = useMemo(() => ({
    visibleFields: effectiveVisibleFields?.length > 0 ? effectiveVisibleFields : displayedFieldNames,
    metricIds: pendingMetricIds || currentMetricIds || [],
    dimensions: pendingDimensions || rawDimensionFields.map(f => f.name) || currentDimensions || [],
  }), [effectiveVisibleFields, displayedFieldNames, pendingMetricIds, currentMetricIds, pendingDimensions, currentDimensions, rawDimensionFields]);

  const showInsertButtons = onAddColumn || onVisibleFieldsChange || onAddMetric;
  const allFields = useMemo(() => [...dimensionFields, ...metricFields], [dimensionFields, metricFields]);

  const handleSort = () => {};

  const handleHideColumn = (fieldName) => {
    const newVisibleFields = getCurrentPending.visibleFields.filter(name => name !== fieldName);
    if (newVisibleFields.length > 0) {
      if (currentDimensions?.includes(fieldName)) {
        setHiddenDimensionFields(prev => new Set(prev).add(fieldName));
      }
      if (isFullscreen && onPendingChange) {
        const changes = { visibleFields: newVisibleFields };
        if (currentDimensions?.includes(fieldName)) {
          changes.dimensions = (pendingDimensions || currentDimensions).filter(d => d !== fieldName);
        }
        onPendingChange(changes);
        handleInsertClose();
      } else if (onVisibleFieldsChange) {
        onVisibleFieldsChange(newVisibleFields, fieldName);
        handleInsertClose();
      } else if (onAddColumn) {
        onAddColumn(null, null, newVisibleFields);
        handleInsertClose();
      }
    }
  };

  const handleInsertClick = (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height });
    setIsPanelOpen(true);
  };
  const handleInsertClose = () => {
    document.activeElement?.blur();
    setIsPanelOpen(false);
    setAnchorRect(null);
  };

  const handleSelectField = (fieldName, fieldType) => {
    if (isFullscreen && onPendingChange) {
      const currentVis = optimisticVisibleFields;
      const changes = { visibleFields: [...currentVis, fieldName] };
      if (fieldType === 'dimension') {
        const baseDims = pendingDimensions || currentDimensions || [];
        if (!baseDims.includes(fieldName)) {
          changes.dimensions = [...baseDims, fieldName];
        }
      }
      onPendingChange(changes);
      handleInsertClose();
    } else if (onAddColumn) {
      onAddColumn(fieldName, fieldType);
      handleInsertClose();
    }
  };

  const handleSelectMetric = (metric) => {
    const aggregation = metric.config?.aggregations?.[0];
    const alias = (aggregation?.alias || `${aggregation?.func}_${aggregation?.field}`).toLowerCase();
    if (isFullscreen && onPendingChange) {
      const currentVis = optimisticVisibleFields;
      const currentVisLower = currentVis.map(f => f.toLowerCase());
      if (!currentVisLower.includes(alias.toLowerCase())) {
        onPendingChange({
          visibleFields: [...currentVis, alias],
          pendingMetrics: [{
            func: aggregation?.func,
            field: aggregation?.field,
            alias,
            name: metric.name,
          }],
        });
      }
      handleInsertClose();
    } else if (onAddMetric) {
      onAddMetric(metric.id, alias);
      handleInsertClose();
    }
  };

  const handleSelectCustomMetric = (metric) => {
    const alias = metric.name || metric.alias || `${metric.func}_${metric.field}`;
    if (isFullscreen && onPendingChange) {
      const currentVis = optimisticVisibleFields;
      const currentVisLower = currentVis.map(f => f.toLowerCase());
      if (!currentVisLower.includes(alias.toLowerCase())) {
        onPendingChange({
          visibleFields: [...currentVis, alias],
          pendingMetrics: [metric],
        });
      }
      handleInsertClose();
    } else if (onAddColumn) {
      onAddColumn(alias, 'metric');
      handleInsertClose();
    }
  };

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * direction;
      return String(valA ?? '').localeCompare(String(valB ?? '')) * direction;
    });
  }, [rows, sortConfig]);

  const aggregatedSingleDimRows = useMemo(() => {
    if (rawDimensionFields.length !== 1 || sortedRows.length === 0) return null;
    const dimName = rawDimensionFields[0].name;
    const metricNames = rawMetricFields.map(f => f.name);
    if (metricNames.length === 0) return null;

    const uniqueCount = new Set(sortedRows.map(r => r[dimName])).size;
    if (uniqueCount === sortedRows.length) return null;

    const groups = new Map();
    for (const row of sortedRows) {
      const val = row[dimName] ?? '(空)';
      const key = String(val);
      if (!groups.has(key)) {
        const group = { [dimName]: row[dimName] };
        groups.set(key, group);
      }
      const g = groups.get(key);
      for (const m of metricNames) {
        if (row[m] != null) {
          g[m] = (g[m] ?? 0) + row[m];
        }
      }
    }
    return [...groups.values()];
  }, [sortedRows, rawDimensionFields, rawMetricFields]);

  const effectiveFlatRows = rawDimensionFields.length >= 2
    ? groupedFlatRows.map((node, idx) => ({ ...node, _flatIndex: idx }))
    : (aggregatedSingleDimRows ?? sortedRows);

  const paginatedRows = useMemo(() => {
    const start = page * pageSize;
    return effectiveFlatRows.slice(start, start + pageSize);
  }, [effectiveFlatRows, page, pageSize]);

  const totalPages = useMemo(() =>
    Math.ceil(effectiveFlatRows.length / pageSize),
    [effectiveFlatRows.length, pageSize]
  );

  useImperativeHandle(ref, () => ({
    copyTable: () => {
      const hasDims = rawDimensionFields.length > 0;
  const dimHeaders = rawDimensionFields.map(f => metricNameMap[f.name] || f.name);
  const metHeaders = rawMetricFields.map(f => metricNameMap[f.name] || f.name);
      const headers = [...dimHeaders, ...metHeaders];

      const tsvRows = [headers.join('\t')];
      for (const item of paginatedRows) {
        const cells = [];
        const isPivotRow = item.type === 'group' || item.type === 'leaf';
        if (isPivotRow) {
          for (const df of rawDimensionFields) cells.push(item.label != null ? String(item.label) : '');
          const isGroupRow = item.type === 'group';
          for (const mf of rawMetricFields) {
            const val = isGroupRow ? item._aggregated?.[mf.name] : item.row?.[mf.name];
            cells.push(val != null ? String(val) : '');
          }
        } else {
          for (const df of rawDimensionFields) cells.push(item[df.name] != null ? String(item[df.name]) : '');
          for (const mf of rawMetricFields) cells.push(item[mf.name] != null ? String(item[mf.name]) : '');
        }
        tsvRows.push(cells.join('\t'));
      }

      navigator.clipboard?.writeText(tsvRows.join('\n'));
    },
  }), [rawDimensionFields, rawMetricFields, paginatedRows, metricNameMap]);

  const availableDimensionFields = useMemo(() => {
    if (!columns) return [];
    return columnFieldNames.filter(name => !optimisticVisibleFields.includes(name) && fieldTypeMap[name] === 'dimension');
  }, [columnFieldNames, columns, optimisticVisibleFields, fieldTypeMap]);

  const availableMetricsForAdd = useMemo(() => {
    if ((!onAddMetric && !onPendingChange) || !availableMetrics) return [];
    const visibleLower = optimisticVisibleFields.map(f => f.toLowerCase());
    return availableMetrics.filter(m => {
      const aggregation = m.config?.aggregations?.[0];
      const alias = (aggregation?.alias || `${aggregation?.func}_${aggregation?.field}`).toLowerCase();
      return !visibleLower.includes(alias);
    });
  }, [availableMetrics, optimisticVisibleFields, onAddMetric, onPendingChange]);



  // 表尾合计行单元格
  const footerCells = useMemo(() => {
    if (numericFieldNames.length === 0 || effectiveFlatRows.length <= 1 || !totals) return null;
    const cells = [];
    const hasDimensions = dimensionFields.length > 0;
    const rowCount = effectiveFlatRows.length;

    if (hasDimensions) {
      dimensionFields.forEach((field, idx) => {
        cells.push({
          key: field.name,
          content: idx === 0 ? `合计 (${rowCount}条)` : '',
          align: 'left',
          isDimension: true,
          stickyLeft: stickyOffsets[field.name],
          sx: { fontStyle: 'italic' },
        });
      });
    } else {
      cells.push({ key: '_total', content: `合计 (${rowCount}条)`, align: 'left', isDimension: true, stickyLeft: 0, sx: { fontStyle: 'italic' } });
    }

    metricFields.forEach((field) => {
      const fmt = metricNameFormatMap[field.name] || 'float';
      cells.push({
        key: field.name,
        content: formatByMetricFormat(totals[field.name], fmt),
        align: 'right',
        isDimension: false,
        sx: { color: 'primary.main' },
      });
    });

    return cells;
  }, [dimensionFields, metricFields, numericFieldNames, effectiveFlatRows, totals, stickyOffsets]);

  // 单元格样式辅助函数，支持粘性定位
  const getCellStyle = (isDimension, isHeader = false, isFooter = false, stickyLeft = null) => {
    const baseStyle = {
      px: 1.5,
      py: isHeader || isFooter ? 1 : 0.5,
      whiteSpace: 'nowrap',
      textAlign: isDimension ? 'left' : 'right',
      fontWeight: isDimension ? 700 : 400,
      fontStyle: isDimension ? 'italic' : 'normal',
      fontFamily: isDimension ? 'inherit' : (theme) => theme.typography.fontFamilyMono,
      fontSize: isFooter ? '0.9375rem' : '0.8125rem',
      color: isHeader ? 'text.secondary' : 'text.primary',
      border: '1px solid',
      borderColor: 'divider',
      backgroundColor: isHeader || isFooter ? 'background.paper' : 'transparent',
    };

    if (isDimension && stickyLeft !== null) {
      baseStyle.position = 'sticky';
      baseStyle.left = stickyLeft;
      baseStyle.zIndex = isHeader ? 3 : isFooter ? 2 : 1;
      baseStyle.backgroundColor = isHeader || isFooter ? 'background.paper' : 'background.default';
    }

    if (isFooter) {
      baseStyle.position = 'sticky';
      baseStyle.bottom = 0;
      if (stickyLeft !== null) baseStyle.zIndex = 2;
    }

    return baseStyle;
  };

  // 表头行粘性定位样式
  const headerRowSx = {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    '& th': { backgroundColor: 'background.paper' },
  };

  const renderHeaderCell = (field) => {
    const isDimension = field.type === 'dimension' || field.type === 'tree';
    const stickyLeft = isDimension ? stickyOffsets[field.name] : null;
    return (
      <TableCell
        key={field.name}
        onClick={() => handleSort(field.name)}
        sx={{
          ...getCellStyle(isDimension, true, false, stickyLeft),
          cursor: field.type === 'tree' ? 'default' : 'pointer',
          userSelect: 'none',
          position: isDimension ? 'sticky' : 'relative',
          overflow: 'visible',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: isDimension ? 'flex-start' : 'flex-end' }}>
          {field.type === 'tree'
            ? <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap' }}>
                {rawDimensionFields.map((f, i) => (
                  <React.Fragment key={f.name}>
                    {i > 0 && <Typography component="span" sx={{ color: 'text.disabled', fontSize: '0.75rem', userSelect: 'none' }}>/</Typography>}
                    <Box
                      component="span"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHiddenDepths(new Set(Array.from({length: rawDimensionFields.length - i - 1}, (_, j) => i + 1 + j)));
                        setPage(0);
                      }}
                      sx={{
                        color: 'primary.main',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                        '&:hover': { color: 'primary.dark' },
                      }}
                    >
                      {metricNameMap[f.name] || f.name}
                    </Box>
                  </React.Fragment>
                ))}
              </Box>
            : (metricNameMap[field.name] || field.name)
          }
          {sortConfig.key === field.name && (
            <Icon name={sortConfig.direction === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} sx={{ color: 'primary.main' }} />
          )}
        </Box>
        {showInsertButtons && (
          <Box
            onClick={(e) => { e.stopPropagation(); handleInsertClick(e); }}
            sx={{
              position: 'absolute', right: -9, top: '50%', transform: 'translateY(-50%)',
              width: 20, height: 20, cursor: 'pointer', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              color: 'text.secondary', fontSize: '0.9375rem', fontWeight: 600, fontStyle: 'normal', lineHeight: 1,
              opacity: 0,
               transition: 'opacity 700ms ease 800ms, background-color 200ms ease, transform 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
              zIndex: 5,
              '&:hover': {
                opacity: 1, bgcolor: 'primary.main',
                borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transform: 'translateY(-50%) scale(1.2)',
                transition: 'opacity 80ms ease 0ms, background-color 200ms ease, transform 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
              },
              '.MuiTableRow-root:hover &': {
                opacity: 0.85, bgcolor: 'grey.100',
                transition: 'opacity 120ms ease 0ms, background-color 200ms ease, transform 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
              },
            }}
          >+</Box>
        )}
      </TableCell>
    );
  };

  const renderTreeCellContent = (row, idx) => {
    const isGroupRow = row.type === 'group';
    const depth = row.depth || 0;
    const paddingLeft = depth * 32 + 16;

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', paddingLeft: `${paddingLeft}px`, minHeight: 22 }}>
        {isGroupRow && row._hasChildren && (
          <Box
            onClick={(e) => { e.stopPropagation(); toggleGroup(row.key); }}
            sx={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, mr: 0.5, flexShrink: 0,
              cursor: 'pointer', borderRadius: '50%',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <Icon
              name={collapsedGroups.has(row.key) ? 'chevronRight' : 'chevronDown'}
              size={12}
              sx={{ color: 'text.secondary' }}
            />
          </Box>
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: isGroupRow ? 700 : 400,
            fontSize: '0.8125rem',
            color: isGroupRow ? 'text.primary' : 'text.primary',
          }}
        >
          {row.label}
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHead>
            <TableRow sx={headerRowSx}>
              <TableCell key="_row" ref={rowNumberRef} sx={{ px: 1.5, py: 1, whiteSpace: 'nowrap', textAlign: 'center', fontWeight: 400, fontStyle: 'normal', fontSize: '0.8125rem', color: 'text.secondary', border: '1px solid', borderColor: 'divider', position: 'sticky', left: 0, zIndex: 3, backgroundColor: 'background.paper', overflow: 'visible' }}>#</TableCell>
              {dimensionFields.map(renderHeaderCell)}
              {metricFields.map(renderHeaderCell)}
            </TableRow>
          </TableHead>

          <TableBody>
            {paginatedRows.map((item, rowIndex) => {
              const isPivotRow = item.type === 'group' || item.type === 'leaf';

              if (isPivotRow) {
                const isGroupRow = item.type === 'group';
                const hasSubGroups = isGroupRow && item._hasChildren;
                const bgColor = hasSubGroups ? 'action.hover' : 'transparent';
                return (
                  <TableRow
                    key={item.key}
                    sx={{
                      '&:hover': { backgroundColor: hasSubGroups ? 'action.selected' : 'action.hover', transition: 'background-color 100ms' },
                      backgroundColor: bgColor,
                    }}
                  >
                    <TableCell key="_row" sx={{ px: 1.5, py: 0.5, whiteSpace: 'nowrap', textAlign: 'center', fontWeight: 400, fontStyle: 'normal', fontSize: '0.8125rem', color: 'text.primary', border: '1px solid', borderColor: 'divider', position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'background.default' }}>
                      {(item._flatIndex ?? 0) + 1}
                    </TableCell>
                    {dimensionFields.map(field => (
                      <TableCell key={field.name} sx={{ ...getCellStyle(true, false, false, stickyOffsets[field.name]) }}>
                        {renderTreeCellContent(item, rowIndex)}
                      </TableCell>
                    ))}
                    {metricFields.map(field => {
                      const val = isGroupRow
                        ? (item._aggregated?.[field.name])
                        : (item.row?.[field.name]);
                      const fmt = metricNameFormatMap[field.name] || 'float';
                      return (
                        <TableCell key={field.name} sx={getCellStyle(false)}>
                          {isLoading && val == null ? <Box component="span" sx={{ display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite', color: 'text.disabled' }}>--</Box> : formatByMetricFormat(val, fmt)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              }

              // 平铺模式渲染
              const row = item;
              return (
                <TableRow key={rowIndex} sx={{ '&:hover': { backgroundColor: 'action.hover', transition: 'background-color 100ms' } }}>
                  <TableCell key="_row" sx={{ px: 1.5, py: 0.5, whiteSpace: 'nowrap', textAlign: 'center', fontWeight: 400, fontStyle: 'normal', fontSize: '0.8125rem', color: 'text.primary', border: '1px solid', borderColor: 'divider', position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'background.default' }}>{page * pageSize + rowIndex + 1}</TableCell>
                  {dimensionFields.map(field => {
                    const rawValue = row[field.name];
                    const displayValue = isDateString(rawValue) ? dateFormatter(rawValue) : rawValue;
                    return (
                      <TableCell key={field.name} sx={getCellStyle(true, false, false, stickyOffsets[field.name])}>
                        {displayValue}
                      </TableCell>
                    );
                  })}
                  {metricFields.map(field => {
                    const val = row[field.name];
                    const fmt = metricNameFormatMap[field.name] || 'float';
                    return (
                      <TableCell key={field.name} sx={getCellStyle(false)}>
                        {isLoading && val == null ? <Box component="span" sx={{ display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite', color: 'text.disabled' }}>--</Box> : formatByMetricFormat(val, fmt)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>

          {footerCells && (
            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
              <TableRow sx={{ '& td': { borderTop: '2px solid', borderTopColor: (theme) => `${theme.palette.primary.main}33` } }}>
                <TableCell key="_row" sx={{ px: 1.5, py: 1, whiteSpace: 'nowrap', textAlign: 'center', fontWeight: 400, fontStyle: 'italic', fontSize: '0.9375rem', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', position: 'sticky', left: 0, bottom: 0, zIndex: 2 }}>-</TableCell>
                {footerCells.map(cell => (
                  <TableCell key={cell.key} sx={{ ...getCellStyle(cell.isDimension, false, true, cell.stickyLeft), ...cell.sx, backgroundColor: 'background.paper' }}>
                    {cell.content}
                  </TableCell>
                ))}
              </TableRow>
              {totalPages > 1 && (
                <TableRow>
                  <TableCell colSpan={1 + dimensionFields.length + metricFields.length} sx={{ p: 0.5, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', position: 'sticky', bottom: 0, zIndex: 2, textAlign: 'right' }}>
                    <Pagination
                      count={totalPages}
                      page={page + 1}
                      onChange={(_, p) => setPage(p - 1)}
                      size="small"
                      shape="rounded"
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableFooter>
          )}
        </Table>
        {!footerCells && totalPages > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, py: 0.5, position: 'sticky', bottom: 0, backgroundColor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', zIndex: 2 }}>
            <Pagination
              count={totalPages}
              page={page + 1}
              onChange={(_, p) => setPage(p - 1)}
              size="small"
              shape="rounded"
            />
          </Box>
        )}
      </TableContainer>

      <ColumnManagementPanel
        anchorRect={anchorRect}
        open={isPanelOpen}
        onClose={handleInsertClose}
        visibleFields={activeFields}
        metricNameMap={metricNameMap}
        availableDimensionFields={availableDimensionFields}
        availableMetricsForAdd={availableMetricsForAdd}
        onHideField={(name) => handleHideColumn(name)}
        onAddField={(name, type) => handleSelectField(name, type)}
        onAddMetric={(metric) => handleSelectMetric(metric)}
      />
    </Box>
  );
}));

TableView.displayName = 'TableView';

export default TableView;
