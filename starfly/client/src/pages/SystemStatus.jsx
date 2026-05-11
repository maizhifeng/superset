import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { systemAPI } from '../api';
import { queryKeys } from '../api/queryKeys';
import { PageWrapper, PageHeader } from '@/components/layouts';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  Alert,
} from '@mui/material';

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  return parts.join(' ') || '< 1分钟';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 1)} ${units[i]}`;
}

const STATUS_CHIP_COLORS = {
  connected: 'success',
  ready: 'success',
  disconnected: 'error',
  disabled: 'default',
  connecting: 'warning',
  error: 'error',
  wait: 'warning',
  close: 'error',
  end: 'error',
};

function StatusChip({ label, status }) {
  return (
    <Chip label={label} color={STATUS_CHIP_COLORS[status] || 'default'} size="small" variant="filled" />
  );
}

function StatRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.2 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500}>{value}</Typography>
    </Box>
  );
}

const GAUGE_THRESHOLD = [
  [0.5, '#22c55e'],
  [0.8, '#eab308'],
  [1, '#ef4444'],
];

const ACTIVITY_COLORS = {
  active: '#3b82f6',
  idle: '#22c55e',
  'idle in transaction': '#eab308',
  fastpath: '#6366f1',
  disabled: '#9ca3af',
};

function GaugeCard({ title, subtitle, value, max, suffix = '%', formatValue, height = 150, colorRanges = GAUGE_THRESHOLD }) {
  const option = useMemo(() => ({
    series: [{
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max,
      pointer: { show: false },
      progress: {
        show: true,
        width: 12,
        roundCap: true,
      },
      axisLine: {
        lineStyle: { width: 12, color: colorRanges },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: formatValue || ((v) => `${Math.round(v)}${suffix}`),
        fontSize: 22,
        fontWeight: 700,
        offsetCenter: [0, '55%'],
      },
      data: [{ value: Math.min(Math.round(value * 10) / 10, max), name: '' }],
    }],
  }), [value, max, suffix, formatValue, colorRanges]);

  return (
    <Paper sx={{ p: 2, flex: '1 1 240px', minWidth: 220 }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.25 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{subtitle}</Typography>
      )}
      <ReactECharts option={option} style={{ width: '100%', height }} notMerge />
    </Paper>
  );
}

function PoolUtilGauge({ pool }) {
  const busyCount = pool.total - pool.idle;
  const utilization = pool.total > 0 ? (busyCount / pool.total) * 100 : 0;

  const option = useMemo(() => ({
    series: [{
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      pointer: { show: false },
      progress: {
        show: true,
        width: 14,
        roundCap: true,
      },
      axisLine: {
        lineStyle: { width: 14, color: GAUGE_THRESHOLD },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (v) => `${Math.round(v)}%`,
        fontSize: 24,
        fontWeight: 700,
        offsetCenter: [0, '55%'],
      },
      data: [{ value: Math.round(utilization * 10) / 10, name: '' }],
    }],
  }), [utilization]);

  return (
    <Paper sx={{ p: 2, flex: '1 1 240px', minWidth: 220 }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.25 }}>连接池利用率</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        忙碌 {busyCount} / 总计 {pool.total}
      </Typography>
      <ReactECharts option={option} style={{ width: '100%', height: 150 }} notMerge />
    </Paper>
  );
}

function DbPoolBar({ pool }) {
  const option = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => params.map((p) => `${p.name}: ${p.value}`).join('<br/>'),
    },
    grid: { left: 50, right: 10, top: 5, bottom: 20 },
    xAxis: {
      type: 'category',
      data: ['总连接', '空闲', '等待'],
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: [
        { value: pool.total, itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } },
        { value: pool.idle, itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] } },
        { value: pool.waiting, itemStyle: { color: pool.waiting > 0 ? '#ef4444' : '#9ca3af', borderRadius: [4, 4, 0, 0] } },
      ],
      barWidth: 36,
      label: {
        show: true,
        position: 'top',
        fontSize: 12,
        fontWeight: 600,
      },
    }],
  }), [pool]);

  return <ReactECharts option={option} style={{ width: '100%', height: 150 }} notMerge />;
}

function ActivityChart({ stats }) {
  const option = useMemo(() => {
    if (!stats || stats.length === 0) return {};
    const names = stats.map((s) => s.state);
    const counts = stats.map((s) => s.cnt);
    return {
      tooltip: { trigger: 'axis', formatter: (params) => params.map((p) => `${p.name}: ${p.value}`).join('<br/>') },
      grid: { left: 80, right: 10, top: 5, bottom: 20 },
      xAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 11 } },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: stats.map((s) => ({
          value: s.cnt,
          itemStyle: { color: ACTIVITY_COLORS[s.state] || '#6366f1', borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 20,
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          fontWeight: 600,
        },
      }],
    };
  }, [stats]);

  return <ReactECharts option={option} style={{ width: '100%', height: 140 }} notMerge />;
}

function LongQueryAlert({ queries }) {
  if (!queries || queries.length === 0) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" fontWeight={600} color="warning.main" sx={{ mb: 0.5, display: 'block' }}>
        长时间运行的查询 ({queries.length})
      </Typography>
      {queries.map((q) => (
        <Alert key={q.pid} severity="warning" sx={{ mb: 0.5, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
            PID {q.pid} | {q.durationSec}s
          </Typography>
          {q.query && (
            <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: 10, color: 'text.secondary', mt: 0.25, wordBreak: 'break-all' }}>
              {q.query}
            </Typography>
          )}
        </Alert>
      ))}
    </Box>
  );
}

export default function SystemStatus() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.systemStatus(),
    queryFn: () => systemAPI.getStatus(),
    refetchInterval: 5000,
    retry: 2,
    retryDelay: 2000,
  });

  const status = data?.data;
  const userPool = status?.performance?.userPool;
  const systemPool = status?.performance?.systemPool;
  const conn = status?.performance?.activeConnection;
  const activityStats = status?.performance?.activityStats;
  const longQueries = status?.performance?.longRunningQueries;

  return (
    <PageWrapper>
      <PageHeader title="系统状态" subtitle="服务器运行状态与资源监控" />

      {isLoading && (
        <Paper sx={{ p: 4, minHeight: 200, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: '100%' }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              正在连接...
            </Typography>
          </Box>
        </Paper>
      )}

      {isError && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error" sx={{ mb: 1 }}>加载失败: {error?.message}</Typography>
          <Typography variant="caption" color="text.secondary">
            后端 API 超时或服务不可用，请检查服务器状态
          </Typography>
        </Paper>
      )}

      {status && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ mb: -1 }}>
            数据库
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Paper sx={{ p: 2, flex: '1 1 280px', minWidth: 240 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  业务数据库
                </Typography>
                <StatusChip
                  label={userPool?.status === 'connected' ? '已连接' : '未连接'}
                  status={userPool?.status || 'disconnected'}
                />
              </Box>
              {conn ? (
                <>
                  <StatRow label="数据源" value={conn.name} />
                  <StatRow label="总连接" value={String(userPool?.total ?? 0)} />
                  <StatRow label="空闲" value={String(userPool?.idle ?? 0)} />
                  <StatRow label="等待" value={String(userPool?.waiting ?? 0)} />
                  {status?.performance?.userTableCount != null && (
                    <StatRow label="业务表" value={`${status.performance.userTableCount} 张`} />
                  )}
                  <Box sx={{ mt: 1 }}>
                    <PoolUtilGauge pool={userPool} />
                  </Box>
                </>
              ) : (
                <Alert severity="info" sx={{ mt: 1, py: 0, '& .MuiAlert-message': { py: 1 } }}>
                  未配置业务数据源连接
                </Alert>
              )}
            </Paper>

            <Paper sx={{ p: 2, flex: '1 1 280px', minWidth: 240 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                连接池分布
              </Typography>
              {userPool?.status === 'connected' ? (
                <DbPoolBar pool={userPool} />
              ) : (
                <Typography variant="caption" color="text.secondary">暂无数据</Typography>
              )}
            </Paper>

            <Paper sx={{ p: 2, flex: '1 1 280px', minWidth: 240 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                当前活动
              </Typography>
              {activityStats && activityStats.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    连接状态分布 ({activityStats.reduce((s, r) => s + r.cnt, 0)} 个连接)
                  </Typography>
                  <ActivityChart stats={activityStats} />
                </Box>
              )}
              <StatRow label="API 请求数" value={String(status.server.requestCount)} />
              <LongQueryAlert queries={longQueries} />
              {!activityStats && !longQueries && (
                <Typography variant="caption" color="text.secondary">暂无活动数据</Typography>
              )}
            </Paper>
          </Box>

          <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ mb: -1 }}>
            系统
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Paper sx={{ p: 2, flex: '1 1 220px', minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                项目数据库
              </Typography>
              <Box sx={{ mb: 1 }}>
                <StatusChip
                  label={systemPool?.status === 'connected' ? '已连接' : '未连接'}
                  status={systemPool?.status || 'disconnected'}
                />
              </Box>
              {systemPool?.status === 'connected' && (
                <Box>
                  <StatRow label="总连接" value={String(systemPool.total)} />
                  <StatRow label="空闲" value={String(systemPool.idle)} />
                  <StatRow label="等待" value={String(systemPool.waiting)} />
                </Box>
              )}
            </Paper>

            <Paper sx={{ p: 2, flex: '1 1 220px', minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                服务状态
              </Typography>
              <StatRow label="运行时长" value={formatUptime(status.server.uptime)} />
              <StatRow label="Node 版本" value={status.server.nodeVersion} />
              <StatRow label="运行环境" value={status.server.env} />
              <StatRow label="系统平台" value={status.server.platform} />
              <StatRow label="进程 PID" value={String(status.server.pid)} />
              <StatRow label="启动时间" value={new Date(status.server.startTime).toLocaleString('zh-CN')} />
            </Paper>

            <Paper sx={{ p: 2, flex: '1 1 220px', minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Redis
              </Typography>
              <StatusChip
                label={(() => {
                  switch (status.performance.redis) {
                    case 'connected': return '已连接';
                    case 'disabled': return '已禁用';
                    case 'disconnected': return '未连接';
                    default: return status.performance.redis;
                  }
                })()}
                status={status.performance.redis}
              />
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 10, height: 10, borderRadius: '50%',
                  bgcolor: status.performance.redis === 'connected' ? '#22c55e'
                    : status.performance.redis === 'disabled' ? '#9ca3af'
                    : '#ef4444',
                }} />
                <Typography variant="body2" color="text.secondary">
                  {status.performance.redis === 'connected' && '缓存服务运行中'}
                  {status.performance.redis === 'disabled' && '缓存功能已关闭'}
                  {status.performance.redis === 'disconnected' && 'Redis 未连接'}
                </Typography>
              </Box>
            </Paper>
          </Box>

          <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ mb: -1 }}>
            资源
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <GaugeCard
              title="CPU 负载"
              subtitle={`${status.resources.cpu.cores} 核`}
              value={(status.resources.cpu.loadAvg[0] / status.resources.cpu.cores) * 100}
              max={100}
            />
            <GaugeCard
              title="堆内存"
              subtitle={`RSS ${formatBytes(status.resources.memory.rss)}`}
              value={(status.resources.memory.heapUsed / status.resources.memory.heapTotal) * 100}
              max={100}
            />
            <GaugeCard
              title="系统内存"
              subtitle={`共 ${formatBytes(status.resources.system.total)}`}
              value={(status.resources.system.used / status.resources.system.total) * 100}
              max={100}
            />
          </Box>
        </Box>
      )}
    </PageWrapper>
  );
}
