import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Divider,
  IconButton,
  Portal,
  Paper,
} from '@mui/material';
import { Icon } from '@/components/ui/icon';

function ColumnItem({
  name,
  type,
  displayName,
  onHide,
  showHideButton,
}) {
  const typeColor = type === 'dimension' ? 'info.main' : 'text.secondary';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        minHeight: 32,
        '&:hover': { backgroundColor: 'action.hover' },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          fontSize: '0.8125rem',
          color: 'text.primary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </Typography>
      <Typography variant="caption" sx={{ color: typeColor, fontSize: '0.625rem', opacity: 0.7 }}>
        {type === 'dimension' ? '维' : '指'}
      </Typography>
      {showHideButton && (
        <IconButton
          size="small"
          onClick={() => onHide(name)}
          sx={{
            p: 0.25,
            color: 'text.secondary',
            '&:hover': { backgroundColor: 'action.selected', color: 'error.main' },
          }}
        >
          <Icon name="close" size={12} />
        </IconButton>
      )}
    </Box>
  );
}

function AddableDimensionItem({ name, onAdd }) {
  return (
    <Box
      onClick={() => onAdd(name, 'dimension')}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        minHeight: 32,
        '&:hover': { backgroundColor: 'action.hover' },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          fontSize: '0.8125rem',
          color: 'text.primary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Typography>
      <Box
        sx={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'action.hover',
          color: 'primary.main',
        }}
      >
        <Icon name="plus" size={12} />
      </Box>
    </Box>
  );
}

function MetricItem({ displayName, func, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        minHeight: 32,
        '&:hover': { backgroundColor: 'action.hover' },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          fontSize: '0.8125rem',
          color: 'text.primary',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </Typography>
      {func && <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem' }}>({func})</Typography>}
      <Box
        sx={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'action.hover',
          color: 'primary.main',
        }}
      >
        <Icon name="plus" size={12} />
      </Box>
    </Box>
  );
}

const ACTIVITY_TIMEOUT = 8000;
const FADE_DELAY = 800;
const FADE_DURATION = 700;

export default function ColumnManagementPanel({
  anchorRect,
  open,
  onClose,
  visibleFields,
  metricNameMap,
  availableDimensionFields,
  availableMetricsForAdd,
  onHideField,
  onAddField,
  onAddMetric,
}) {
  const [search, setSearch] = useState('');
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef(null);
  const exitTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    document.activeElement?.blur();
    setSearch('');
    onClose();
  }, [onClose]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      close();
    }, ACTIVITY_TIMEOUT);
  }, [close, clearInactivityTimer]);

  const handleBackdropClick = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      clearExitTimer();
      close();
    }
  };

  const handleMouseEnter = useCallback(() => {
    clearExitTimer();
    setExiting(false);
  }, [clearExitTimer]);

  const handleMouseLeave = useCallback(() => {
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      close();
    }, FADE_DELAY + FADE_DURATION);
  }, [close]);

  useEffect(() => {
    if (!open) {
      setExiting(false);
      clearExitTimer();
      clearInactivityTimer();
      return;
    }
    resetInactivityTimer();
    return () => {
      clearExitTimer();
      clearInactivityTimer();
    };
  }, [open, resetInactivityTimer, clearExitTimer, clearInactivityTimer]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        clearExitTimer();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close, clearExitTimer]);

  useEffect(() => {
    if (!open) return;
    const handleScroll = () => {
      clearExitTimer();
      close();
    };
    const tableContainer = panelRef.current?.closest('.MuiTableContainer-root');
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (tableContainer) {
        tableContainer.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, close, clearExitTimer]);

  const searchLower = search.toLowerCase();

  const filteredVisible = useMemo(() => {
    const effective = visibleFields || [];
    if (!search) return effective;
    return effective.filter(f => {
      const dn = (metricNameMap?.[f.name] || f.name).toLowerCase();
      return dn.includes(searchLower) || f.name.toLowerCase().includes(searchLower);
    });
  }, [visibleFields, search, searchLower, metricNameMap]);

  const filteredDimensions = useMemo(() => {
    if (!search) return availableDimensionFields || [];
    return (availableDimensionFields || []).filter(f => f.toLowerCase().includes(searchLower));
  }, [availableDimensionFields, search, searchLower]);

  const filteredMetrics = useMemo(() => {
    const items = [];
    if (onAddMetric) {
      const list = search
        ? (availableMetricsForAdd || []).filter(m => {
            const agg = m.config?.aggregations?.[0];
            const alias = (agg?.alias || `${agg?.func}_${agg?.field}`).toLowerCase();
            return (m.name || '').toLowerCase().includes(searchLower) || alias.includes(searchLower);
          })
        : (availableMetricsForAdd || []);
      list.forEach(m => {
        const agg = m.config?.aggregations?.[0];
        items.push({
          key: m.id,
          displayName: m.name,
          func: agg?.func,
          onClick: () => onAddMetric(m),
        });
      });
    }
    return items;
  }, [availableMetricsForAdd, search, searchLower, onAddMetric]);

  const hasAnyAddable = (onAddField && filteredDimensions.length > 0) || filteredMetrics.length > 0;

  const totalVisible = (visibleFields || []).length;
  const addableCount = (onAddField ? (availableDimensionFields || []).length : 0) + (onAddMetric ? (availableMetricsForAdd || []).length : 0);

  if (!open || !anchorRect) return null;

  const popoverStyle = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.right - 280,
    zIndex: 1300,
  };

  return (
    <Portal>
      <Box
        onClick={handleBackdropClick}
        sx={{ position: 'fixed', inset: 0, zIndex: 1299 }}
      />
      <Paper
        ref={panelRef}
        elevation={8}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={resetInactivityTimer}
        sx={{
          ...popoverStyle,
          p: 0,
          borderRadius: 2,
          minWidth: 280,
          maxWidth: 380,
          maxHeight: 480,
          boxShadow: 'var(--mui-palette-shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          opacity: exiting ? 0 : 1,
          transition: exiting
            ? `opacity ${FADE_DURATION}ms ease ${FADE_DELAY}ms`
            : 'opacity 80ms ease 0ms',
          pointerEvents: exiting ? 'none' : 'auto',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Header with search */}
        <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>列管理</Typography>
            <Typography variant="caption" color="text.secondary">
              {totalVisible} 可见 · {addableCount} 可用
            </Typography>
          </Box>
          <TextField
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索字段..."
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 0.5 }}>
                    <Icon name="search" size={14} />
                  </InputAdornment>
                ),
                sx: { fontSize: '0.8125rem', height: 32 },
              },
            }}
            sx={{ mb: 0.5 }}
          />
        </Box>

        {/* Scrollable content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 0 }}>
          {/* Visible section */}
          <Box>
            <Typography variant="caption" sx={{ px: 1.5, py: 0.5, color: 'text.secondary', fontWeight: 600, display: 'block' }}>
              已显示 ({totalVisible})
            </Typography>
            {filteredVisible.length > 0 ? (
              filteredVisible.map(f => (
                <ColumnItem
                  key={f.name}
                  name={f.name}
                  type={f.type}
                  displayName={metricNameMap?.[f.name] || f.name}
                  onHide={onHideField}
                  showHideButton={filteredVisible.length > 1}
                />
              ))
            ) : search ? (
              <Typography variant="caption" sx={{ px: 1.5, py: 1, color: 'text.disabled', display: 'block' }}>无匹配结果</Typography>
            ) : (
              <Typography variant="caption" sx={{ px: 1.5, py: 1, color: 'text.disabled', display: 'block' }}>无可见列</Typography>
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          {/* Addable section */}
          <Box>
            <Typography variant="caption" sx={{ px: 1.5, py: 0.5, color: 'text.secondary', fontWeight: 600, display: 'block' }}>
              可添加
            </Typography>

            {!hasAnyAddable && !search && (
              <Typography variant="caption" sx={{ px: 1.5, py: 1, color: 'text.disabled', display: 'block' }}>
                所有字段均已显示
              </Typography>
            )}

            {/* Dimension fields */}
            {onAddField && filteredDimensions.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ px: 1.5, py: 0.5, color: 'info.main', fontWeight: 600, display: 'block', fontSize: '0.6875rem' }}>
                  维度列
                </Typography>
                {filteredDimensions.map(name => (
                  <AddableDimensionItem
                    key={name}
                    name={name}
                    onAdd={onAddField}
                  />
                ))}
              </Box>
            )}

            {/* Metrics */}
            {(onAddMetric || onAddCustomMetric) && filteredMetrics.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ px: 1.5, pt: 1, pb: 0.5, color: 'info.main', fontWeight: 600, display: 'block', fontSize: '0.6875rem' }}>
                  指标
                </Typography>
                {filteredMetrics.map(item => (
                  <MetricItem
                    key={item.key}
                    displayName={item.displayName}
                    func={item.func}
                    onClick={item.onClick}
                  />
                ))}
              </Box>
            )}

            {hasAnyAddable && search && (
              (onAddField ? filteredDimensions.length === 0 : true)
              && filteredMetrics.length === 0
            ) && (
              <Typography variant="caption" sx={{ px: 1.5, py: 1, color: 'text.disabled', display: 'block' }}>
                无匹配结果
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
      </Paper>
    </Portal>
  );
}
