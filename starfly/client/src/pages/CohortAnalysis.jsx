// ============================================================
// 同期群分析页面 - 用户留存与行为同期群分析
// ============================================================

import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import SaveIcon from '@mui/icons-material/Save';
import TemplateIcon from '@mui/icons-material/Bookmark';
import UploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { useQuery } from '@tanstack/react-query';
import { useCohortStore } from '../store/cohortStore';
import { cohortAPI } from '../api/cohortAPI';
import { queryKeys } from '../api/queryKeys';
import CohortDefinitionPanel from '../components/cohort/CohortDefinitionPanel';
import CohortMetricSwitcher from '../components/cohort/CohortMetricSwitcher';
import CohortHeatmapTable from '../components/cohort/CohortHeatmapTable';
import CohortTrendChart from '../components/cohort/CohortTrendChart';
import CohortTemplatePanel from '../components/cohort/CohortTemplatePanel';
import CohortUploadModal from '../components/cohort/CohortUploadModal';
import EmptyState from '../components/layouts/EmptyState';

export default function CohortAnalysis() {
  const config = useCohortStore((s) => s.config);
  const results = useCohortStore((s) => s.results);
  const error = useCohortStore((s) => s.error);
  const setResults = useCohortStore((s) => s.setResults);
  const setError = useCohortStore((s) => s.setError);
  const setLoading = useCohortStore((s) => s.setLoading);
  const uploadModalOpen = useCohortStore((s) => s.uploadModalOpen);
  const setUploadModalOpen = useCohortStore((s) => s.setUploadModalOpen);
  const showTemplates = useCohortStore((s) => s.showTemplates);
  const setShowTemplates = useCohortStore((s) => s.setShowTemplates);
  const [viewMode, setViewMode] = React.useState('table');

  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.cohortAnalysis(config),
    queryFn: () => cohortAPI.analyze(config),
    enabled: false,
    staleTime: 0,
  });

  const handleRun = () => {
    setError(null);
    refetch().then((res) => {
      if (res?.data?.success) {
        setResults(res.data.data);
      } else {
        setError(res.error?.message || res?.data?.error || '分析失败');
      }
    }).catch((err) => {
      setError(err?.message || '请求失败，请重试');
    });
  };

  useEffect(() => {
    if (isLoading) setLoading(true);
    else setLoading(false);
  }, [isLoading, setLoading]);

  useEffect(() => {
    if (data?.data) {
      setResults(data.data);
    }
  }, [data, setResults]);

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 定义面板 */}
      <CohortDefinitionPanel onRun={handleRun} isLoading={isLoading} />

      {/* 主内容区域 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
        {/* 标题栏 */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
            同期群分析
          </Typography>
          <Tooltip title="保存配置">
            <IconButton size="small" onClick={() => setShowTemplates(true)}>
              <SaveIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="模板管理">
            <IconButton size="small" onClick={() => setShowTemplates(true)}>
              <TemplateIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="上传CSV">
            <IconButton size="small" onClick={() => setUploadModalOpen(true)}>
              <UploadIcon />
            </IconButton>
          </Tooltip>
          {results && (
            <Tooltip title="刷新">
              <IconButton size="small" onClick={handleRun}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* 指标与视图切换 */}
        <CohortMetricSwitcher
          currentMetric={config.metric}
          onChange={(metric) => {
            useCohortStore.getState().setConfig({ metric });
            setTimeout(handleRun, 0);
          }}
          viewMode={viewMode}
          onViewChange={setViewMode}
        />

        {/* 错误提示 */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={
            <Button size="small" color="inherit" onClick={handleRun}>重试</Button>
          }>
            {error}
          </Alert>
        )}

        {/* 结果区域 */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {!results && !isLoading && !error && (
            <EmptyState title="同期群分析" description="创建同期群分析配置并点击运行" />
          )}

          {isLoading && (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
              <Skeleton variant="rectangular" height={300} />
            </Box>
          )}

          {results && !isLoading && viewMode === 'table' && (
            <CohortHeatmapTable data={results} dateMode={config.dateMode} />
          )}

          {results && !isLoading && viewMode === 'chart' && (
            <CohortTrendChart data={results} />
          )}

          {results && !isLoading && results.matrix?.length === 0 && (
            <EmptyState title="无数据" description="所选条件下无数据" />
          )}
        </Box>
      </Box>

      {/* 模态框 */}
      <CohortTemplatePanel
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
      />
      <CohortUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
      />
    </Box>
  );
}
