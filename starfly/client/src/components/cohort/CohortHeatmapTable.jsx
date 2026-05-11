import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { formatDateLabelCompact, formatWeekRange, formatMonthLabel } from '../../utils/formatters';

function computeCoefficient(rowData, metric) {
  const valid = rowData.filter(v => v !== null && v !== undefined);
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  const n = valid.length - 1;
  if (first <= 0 || last <= 0) return null;
  const ratio = last / first;
  const perPeriod = Math.pow(ratio, 1 / n);
  if (metric === 'retention_rate') return 1 - perPeriod;
  if (metric === 'ltv_multiplier') return perPeriod;
  return perPeriod - 1;
}

function getCoefficientTooltip(metric) {
  const algo = metric === 'retention_rate'
    ? '1 - (末期值 / 初期值) ^ (1 / 周期数)'
    : metric === 'ltv'
    ? '(末期值 / 初期值) ^ (1 / 周期数) - 1'
    : '(末期值 / 初期值) ^ (1 / 周期数)';
  const example = metric === 'retention_rate'
    ? '1 - (1.6 / 96.8) ^ (1/5) ≈ 44.0%'
    : metric === 'ltv'
    ? '(3.20 / 1.00) ^ (1/5) - 1 ≈ 26.2%'
    : '(3.20 / 1.00) ^ (1/5) ≈ 1.26x';
  const label = metric === 'ltv_multiplier' ? '增长倍率' : metric === 'ltv' ? '增长率' : '衰减率';
  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>{label}</Typography>
      <Typography variant="caption" component="div">算法: {algo}</Typography>
      <Typography variant="caption" component="div">算例: {example}</Typography>
    </Box>
  );
}

function getColorForValue(value, metricUnit, metric) {
  if (value === null || value === undefined) return 'transparent';
  const isPercent = metricUnit === '%' || metric === 'retention_rate' || metric === 'conversion_rate';
  const normalized = isPercent ? Math.min(value / 100, 1) : Math.min(value / 100, 1);

  if (metric === 'retention_rate' || metric === 'conversion_rate') {
    const r = Math.round(255 - normalized * 200);
    const g = Math.round(255 - normalized * 80);
    const b = Math.round(255 - normalized * 200);
    return `rgba(${Math.min(255, Math.max(0, r))}, ${Math.min(255, Math.max(0, g))}, ${Math.min(255, Math.max(0, b))}, 0.85)`;
  }

  if (metric === 'ltv_multiplier') {
    const offset = Math.max(0, value - 1);
    const intensity = Math.min(offset / 5, 1);
    return `rgba(33, 150, 243, ${0.15 + intensity * 0.7})`;
  }
  if (metric === 'arpu' || metric === 'revenue' || metric === 'ltv') {
    const intensity = Math.min(normalized * 1.5, 1);
    return `rgba(33, 150, 243, ${0.15 + intensity * 0.7})`;
  }

  return `rgba(76, 175, 80, ${0.15 + normalized * 0.7})`;
}

function getTextColor(value, metric) {
  if (value === null || value === undefined) return '#999';
  if (metric === 'ltv' || metric === 'ltv_multiplier') return 'rgba(0, 0, 0, 0.87)';
  const isPercent = metric === 'retention_rate' || metric === 'conversion_rate';
  const normalized = isPercent ? Math.min(value / 100, 1) : Math.min(value / 50, 1);
  return normalized > 0.5 ? '#fff' : 'rgba(0, 0, 0, 0.87)';
}

function formatCellValue(value, metric, unit) {
  if (value === null || value === undefined) return '-';
  if (metric === 'retention_rate' || metric === 'conversion_rate') return `${value.toFixed(1)}%`;
  if (metric === 'ltv_multiplier') return `${value.toFixed(2)}x`;
  if (metric === 'arpu' || metric === 'revenue' || metric === 'ltv') return `¥${value.toFixed(2)}`;
  return String(value);
}

function formatCohortDate(date, cohortPeriod) {
  if (!date) return '';
  if (cohortPeriod === 'week') return formatWeekRange(date);
  if (cohortPeriod === 'month') return formatMonthLabel(date);
  return formatDateLabelCompact(date);
}

const DIMENSION_LABELS = {
  platform: '平台', game_id: '游戏', channel_id: '渠道',
  country: '地区',
};

const stickyLeft = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
};

const cellStyle = {
  border: '1px solid rgba(0,0,0,0.06)',
  padding: '3px 5px',
  textAlign: 'center',
  cursor: 'default',
  fontWeight: 500,
  fontSize: '0.7rem',
  whiteSpace: 'nowrap',
};

const periodSuffix = { day: '日', week: '周', month: '月' };

function CohortTable({ title, cohorts, periods, matrixRows, colTotals, metric, metricUnit, metricLabel, cohortPeriod, dateMode }) {
  return (
    <Box>
      {title && (
        <Typography variant="caption" fontWeight={600} sx={{ py: 0.3, px: 0.5, display: 'block' }}>
          {title}
        </Typography>
      )}
      <Box sx={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.7rem', minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            {periods.map((_, i) => <col key={i} />)}
            {colTotals && <col style={{ width: 60 }} />}
          </colgroup>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', top: 0, left: 0, zIndex: 3,
                background: '#fff', borderBottom: '1px solid #e0e0e0',
                padding: '4px 8px', textAlign: 'center',
                whiteSpace: 'nowrap', fontSize: '0.7rem',
              }}>
                周期
              </th>
              {periods.map((p) => (
                <th key={p.index} style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  background: '#fff', borderBottom: '1px solid #e0e0e0',
                  padding: '4px 4px', textAlign: 'center',
                  fontWeight: 600, fontSize: '0.65rem',
                  whiteSpace: 'nowrap',
                }}>
                  {p.label}
                </th>
              ))}
              {colTotals && (
                <th style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  background: '#f5f5f5', borderBottom: '1px solid #e0e0e0',
                  padding: '4px 4px', textAlign: 'center',
                  fontWeight: 600, fontSize: '0.65rem',
                  whiteSpace: 'nowrap',
                }}>
                  <Tooltip title={getCoefficientTooltip(metric)} arrow slotProps={{ popper: { sx: { zIndex: 1400 } } }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.2, cursor: 'pointer' }}>
                      {metric === 'ltv_multiplier' ? '倍率' : metric === 'ltv' ? '增长率' : '衰减率'}
                      <InfoOutlined sx={{ fontSize: 11, color: 'text.secondary' }} />
                    </Box>
                  </Tooltip>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort, rowIdx) => {
              const rowData = matrixRows[rowIdx];
              return (
                <tr key={rowIdx}>
                  <td style={{
                    ...stickyLeft, background: '#fff',
                    borderBottom: '1px solid #f0f0f0',
                    padding: '3px 8px', fontWeight: 500, fontSize: '0.7rem',
                    textAlign: 'center', whiteSpace: 'nowrap',
                  }}>
                    <Tooltip title={dateMode === 'relative' ? `第${rowIdx + 1}${periodSuffix[cohortPeriod] || '周'}` : formatCohortDate(cohort.date, cohortPeriod)} arrow placement="right" slotProps={{ popper: { sx: { zIndex: 1400 } } }}>
                      <span>{dateMode === 'relative' ? `第${rowIdx + 1}${periodSuffix[cohortPeriod] || '周'}` : formatCohortDate(cohort.date, cohortPeriod)}</span>
                    </Tooltip>
                  </td>
                  {rowData.map((cell, colIdx) => (
                    <td key={colIdx}
                      style={{
                        ...cellStyle,
                        background: getColorForValue(cell, metricUnit, metric),
                        color: getTextColor(cell, metric),
                      }}
                    >
                      <Tooltip title={cell !== null ? `${formatCohortDate(cohort.date, cohortPeriod)} ${periods[colIdx]?.label}: ${formatCellValue(cell, metric, metricUnit)}` : '无数据'} arrow slotProps={{ popper: { sx: { zIndex: 1400 } } }}>
                        <span>{formatCellValue(cell, metric, metricUnit)}</span>
                      </Tooltip>
                    </td>
                  ))}
                  {colTotals && (() => {
                    const val = computeCoefficient(rowData, metric);
                    return (
                      <td style={{
                        background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.06)',
                        padding: '3px 5px', textAlign: 'center',
                        fontWeight: 500, fontSize: '0.65rem',
                        whiteSpace: 'nowrap',
                      }}>
                        {val === null || val === undefined ? '—'
                          : metric === 'ltv_multiplier' ? `${val.toFixed(2)}x`
                          : `${(val * 100).toFixed(1)}%`}
                      </td>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

export default function CohortHeatmapTable({ data, dateMode }) {
  const { cohorts, cohortPeriod, periods, matrix, colTotals, metric, metricLabel, metricUnit, dimensions } = data;

  const sections = useMemo(() => {
    if (!dimensions?.length) return null;
    const groups = {};
    cohorts.forEach((c, i) => {
      const key = dimensions.map(d => String(c[d] ?? '')).join('::');
      if (!groups[key]) groups[key] = { dimValues: dimensions.map(d => c[d]), rows: [], rowIndices: [] };
      groups[key].rows.push(c);
      groups[key].rowIndices.push(i);
    });
    return Object.values(groups).map(g => {
      const totals = new Array(periods.length).fill(0);
      const counts = new Array(periods.length).fill(0);
      g.rowIndices.forEach(idx => {
        matrix[idx].forEach((cell, ci) => {
          if (cell !== null) { totals[ci] += cell; counts[ci]++; }
        });
      });
      g.sectionTotals = totals.map((t, ci) => counts[ci] > 0 ? parseFloat((t / counts[ci]).toFixed(2)) : null);
      return g;
    });
  }, [cohorts, dimensions, periods, matrix]);

  if (!dimensions?.length || !sections) {
    return (
      <Box sx={{ overflow: 'auto', maxHeight: '100%' }}>
        <CohortTable
          cohorts={cohorts}
          periods={periods}
          matrixRows={matrix}
          colTotals={colTotals}
          metric={metric}
          metricUnit={metricUnit}
          metricLabel={metricLabel}
          cohortPeriod={cohortPeriod}
          dateMode={dateMode}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', maxHeight: '100%' }}>
      {sections.map((section, si) => {
        const title = dimensions.map((d, di) =>
          `${DIMENSION_LABELS[d] || d}: ${section.dimValues[di] ?? '—'}`
        ).join(' | ');

        return (
          <Box key={section.dimValues.join('-')} sx={{ mb: 1.5 }}>
            <Divider sx={{ mb: 0.5 }} />
            <CohortTable
              title={title}
              cohorts={section.rows}
              periods={periods}
              matrixRows={section.rowIndices.map(idx => matrix[idx])}
              colTotals={section.sectionTotals}
              metric={metric}
              metricUnit={metricUnit}
              metricLabel={metricLabel}
              cohortPeriod={cohortPeriod}
              dateMode={dateMode}
            />
          </Box>
        );
      })}
    </Box>
  );
}
