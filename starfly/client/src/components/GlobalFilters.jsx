// ============================================================
// GlobalFilters — 全局筛选器组件
// 使用 MUI Accordion 实现折叠/展开动画
// 包含日期筛选、活跃筛选标签、候选筛选池
// ============================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDashboardStore } from '../store';
import { Icon } from '@/components/ui/icon';
import dayjs from 'dayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  PermanentDateFilter,
  FilterTransitionZone,
} from './GlobalFilters/index';
import { getFilterConfig, getFallbackOptions } from '@/config/filterConfig';

// DateCalendar 紧凑样式 — 紧凑间距、小字体、单列适配
const compactCalendarSx = {
  '& .MuiPickersCalendarHeader-root': { pl: 0.5, pr: 0.5, mt: 0, mb: 0 },
  '& .MuiPickersCalendarHeader-label': { fontSize: '0.7rem' },
  '& .MuiPickersArrowSwitcher-root': { '& .MuiIconButton-root': { width: 22, height: 22, p: 0.25 } },
  '& .MuiDayCalendar-weekDayLabel': { fontSize: '0.6rem', width: 24, height: 20, p: 0 },
  '& .MuiDayCalendar-header': { justifyContent: 'space-evenly', pt: 0 },
  '& .MuiDayCalendar-weekContainer': { justifyContent: 'space-evenly' },
  '& .MuiPickersSlideTransition-root': { minHeight: 0 },
  '& .MuiDayCalendar-monthContainer': { p: 0 },
  width: 200,
  m: 0,
  height: 'auto',
  maxHeight: 'none',
};

/**
 * ActiveFilterSummary — 折叠状态下活跃筛选值的紧凑文本摘要
 * 格式："筛选器名称: 选项A 选项B +N | 筛选器2名称: 选项A +N"
 */
function ActiveFilterSummary() {
  const activeFilters = useDashboardStore(state => state.globalFilters.active);

  const parts = activeFilters
    .filter(f => f.values.length > 0)
    .map((f, fi) => {
      const config = getFilterConfig(f.filterId);
      const label = config?.label || f.filterId;
      const options = getFallbackOptions(f.field) || [];

      // 如果已选中全部可用选项，显示"全部"
      const summaryText = (() => {
        if (options.length > 0 && f.values.length >= options.length) {
          return '全部';
        }
        const valueLabels = f.values.slice(0, 2).map(v => {
          const opt = options.find(o => o.value === v);
          return opt?.label || v;
        });
        const overflow = f.values.length - 2;
        if (overflow > 0) valueLabels.push(`+${overflow}`);
        return valueLabels.join(' ');
      })();

      return (
        <Box key={f.filterId} component="span" sx={{ display: 'inline', whiteSpace: 'nowrap' }}>
          {/* 筛选器之间的分隔竖线 */}
          {fi > 0 && <Box component="span" sx={{ color: 'text.disabled', mx: 0.5, fontSize: '0.65rem' }}>|</Box>}
          {/* 主色显示的筛选器名称 */}
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 500, fontSize: '0.75rem' }}>
            {label}:
          </Box>
          {/* 次要色显示的筛选值 */}
          <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem', ml: 0.25 }}>
            {summaryText}
          </Box>
        </Box>
      );
    });

  if (parts.length === 0) return null;

  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
      {parts}
    </Box>
  );
}

/**
 * GlobalFilters — 主容器，组合以下功能：
 * 1. 窗帘式折叠摘要（日期标签 + 活跃筛选概览）
 * 2. 展开后的完整筛选栏（固定日期、活跃筛选、候选池）
 *
 * 使用 MUI Accordion 实现原生展开/折叠动画，
 * 点击外部区域自动折叠。
 */
export default function GlobalFilters() {
  const resetGlobalFilters = useDashboardStore(state => state.resetGlobalFilters);
  const setDateRange = useDashboardStore(state => state.setDateRange);
  const dateRange = useDashboardStore(state => state.globalFilters.permanent.dateRange);
  const activeFilters = useDashboardStore(state => state.globalFilters.active);

  const [showCustomDate, setShowCustomDate] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isExpanded || isPinned) return;
    const handleClick = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (e.target?.closest('.MuiPopover-root, .MuiPopper-root, .MuiModal-root, [role="listbox"], [role="menu"], [role="dialog"], .MuiMenu-root')) return;
      setIsExpanded(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isExpanded, isPinned]);

  // 生成折叠状态下的日期标签
  // 格式：预设模式 "近7天: 04-19 ~ 04-26"，自定义模式 "04-19 ~ 04-26"
  const dateLabel = useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) return '近7天';
    const fmt = (d) => d.replace(/^\d{4}-/, '');
    const dateStr = `${fmt(dateRange.start)} ~ ${fmt(dateRange.end)}`;
    return dateRange.label && dateRange.label !== 'custom'
      ? `${dateRange.label}: ${dateStr}`
      : dateStr;
  }, [dateRange]);

  const handleReset = () => {
    resetGlobalFilters();
    setShowCustomDate(false);
  };

  const handleDateCalendarChange = (field) => (value) => {
    if (value == null) return;
    const formattedDate = dayjs(value).format('YYYY-MM-DD');
    const safeDateRange = dateRange || { start: '', end: '' };
    setDateRange({ ...safeDateRange, [field]: formattedDate, label: 'custom' });
  };

  return (
      <Box ref={containerRef}>
        <Accordion
          expanded={isExpanded}
          onChange={(_, expanded) => {
            if (!isPinned) setIsExpanded(expanded);
          }}
          disableGutters
          elevation={0}
          square
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '&::before': { display: 'none' },
            '&.Mui-expanded': { m: 0 },
          }}
        >
          {/* ===== 折叠摘要栏（窗帘杆） ===== */}
          <AccordionSummary
            expandIcon={
              <Icon
                name="chevronRight"
                size={16}
                sx={{
                  color: 'text.disabled',
                  transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              />
            }
            sx={{
              minHeight: 'auto',
              px: 2,
              py: 0.75,
              cursor: 'pointer',
              '&.Mui-expanded': { minHeight: 'auto' },
              '& .MuiAccordionSummary-content': {
                m: 0,
                alignItems: 'center',
                gap: 1.5,
              },
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            {/* 日期范围标签 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Icon name="calendar" size={14} sx={{ color: 'primary.main' }} />
              <Typography
                sx={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'primary.main',
                  lineHeight: 1,
                }}
              >
                {dateLabel}
              </Typography>
            </Box>

            <ActiveFilterSummary />
          </AccordionSummary>

          {/* ===== 展开后的完整筛选栏（窗帘布） ===== */}
          <AccordionDetails sx={{ px: 2, pb: 0.75, pt: 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              {/* 左列：日期筛选 + 可选的紧凑日历 */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <PermanentDateFilter
                  showCustomDate={showCustomDate}
                  onCustomDateToggle={setShowCustomDate}
                />
                {showCustomDate && (
                   <Box sx={{ display: 'flex', gap: 0.5 }}> 
                    <DateCalendar
                      value={dayjs(dateRange?.start)}
                      onChange={handleDateCalendarChange('start')}
                      reduceAnimations
                      sx={compactCalendarSx}
                      slotProps={{
                        day: { sx: { fontSize: '0.7rem', m: 0, p: 0, width: 24, height: 22 } },
                      }}
                    />
                    <DateCalendar
                      value={dayjs(dateRange?.end)}
                      onChange={handleDateCalendarChange('end')}
                      reduceAnimations
                      sx={compactCalendarSx}
                      slotProps={{
                        day: { sx: { fontSize: '0.7rem', m: 0, p: 0, width: 24, height: 22 } },
                      }}
                    />
                  </Box>
                )}
              </Box>

              {/* 分隔线 */}
              <Box
                sx={{
                  width: '1px',
                  alignSelf: 'stretch',
                  bgcolor: 'divider',
                  flexShrink: 0,
                }}
              />

              {/* 区域2：筛选过渡区（活跃筛选 + 候选池） */}
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <FilterTransitionZone />
              </Box>

              {/* 固定按钮 */}
              <Tooltip title={isPinned ? '取消固定' : '固定筛选栏'}>
                <IconButton
                  size="small"
                  onClick={() => setIsPinned(prev => !prev)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    border: '1px solid',
                    borderColor: isPinned ? 'primary.main' : 'divider',
                    color: isPinned ? 'primary.main' : 'text.secondary',
                    '&:hover': {
                      borderColor: isPinned ? 'primary.main' : 'divider',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <Icon name="pin" size={16} />
                </IconButton>
              </Tooltip>

              {/* 重置按钮 */}
              <Tooltip title="重置筛选">
                <IconButton
                  size="small"
                  onClick={handleReset}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: 'divider',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <Icon name="undo" size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
  );
}
