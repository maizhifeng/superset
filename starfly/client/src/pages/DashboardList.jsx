// ============================================================
// 仪表盘列表页面 - 查看和管理所有仪表盘
// ============================================================

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardsAPI } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardSkeleton } from '../components/Skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import TextField from '@mui/material/TextField';
import { Label } from '@/components/ui/label';
import ConfirmDialog from '../components/ConfirmDialog';
import { PageWrapper, PageHeader, EmptyState } from '@/components/layouts';
import { useOperationLogStore } from '../store';
import { useToast } from '@/components/Toast';
import {
  Box,
  Paper,
  Typography,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

const DASHBOARD_ICONS = [
  { name: 'dashboard', label: '仪表盘' },
  { name: 'chart', label: '图表' },
  { name: 'megaphone', label: '营销' },
  { name: 'layoutGrid', label: '网格' },
  { name: 'columns', label: '列' },
  { name: 'share', label: '分享' },
  { name: 'database', label: '数据库' },
  { name: 'sparkles', label: '智能' },
  { name: 'layerGroup', label: '层级' },
  { name: 'layout', label: '布局' },
  { name: 'history', label: '历史' },
  { name: 'user', label: '用户' },
];

export default function DashboardList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('dashboard');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });
  const addDeleted = useOperationLogStore((state) => state.addDeleted);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: dashboardsAPI.list,
  });

  const createMutation = useMutation({
    mutationFn: dashboardsAPI.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['dashboards']);
      navigate(`/dashboards/${data.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: dashboardsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboards']);
    },
  });

  const dashboards = data?.data || [];

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name) return;
    createMutation.mutate({ name, description, icon: selectedIcon, layout: { cols: 12, rows: 8 } });
  };

  const handleDelete = (id, name) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const confirmDelete = () => {
    if (deleteConfirm.id) {
      // 先获取完整数据存入回收站
      const dashboard = dashboards.find(d => d.id === deleteConfirm.id);
      if (dashboard) {
        addDeleted('dashboard', dashboard.id, dashboard.name, {
          name: dashboard.name,
          description: dashboard.description,
          layout: dashboard.layout,
          widgets: dashboard.widgets || [],
        });
      }
      deleteMutation.mutate(deleteConfirm.id);
      toast.showSuccess(`"${deleteConfirm.name}" 已移至操作记录`);
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
    }
  };

  return (
    <PageWrapper maxWidth="xl">
      <PageHeader
        title="仪表盘"
        subtitle="管理和组织您的分析仪表盘"
        actions={
          <Button onClick={() => setShowCreateForm(true)}>
            <Icon name="plus" size={16} />
            新建仪表盘
          </Button>
        }
      />

      <Dialog open={showCreateForm} onClose={() => { document.activeElement?.blur(); setShowCreateForm(false); setSelectedIcon('dashboard'); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建仪表盘</DialogTitle>
          </DialogHeader>
          <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <Label htmlFor="dashboard-name">名称</Label>
              <Input
                id="dashboard-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如: 营销概览"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="dashboard-desc">描述</Label>
              <TextField
                id="dashboard-desc"
                multiline
                rows={2}
                size="small"
                fullWidth
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="可选描述"
                sx={{ resize: 'none', '& .MuiInputBase-input': { fontSize: '0.8125rem' } }}
              />
            </div>
            <div>
              <Label>图标</Label>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                {DASHBOARD_ICONS.map((ico) => (
                  <Box
                    key={ico.name}
                    onClick={() => setSelectedIcon(ico.name)}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: selectedIcon === ico.name ? 'primary.main' : 'divider',
                      bgcolor: selectedIcon === ico.name ? 'primary.main' : 'transparent',
                      color: selectedIcon === ico.name ? '#fff' : 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: 'primary.main', bgcolor: selectedIcon === ico.name ? 'primary.main' : 'action.hover' },
                    }}
                    title={ico.label}
                  >
                    <Icon name={ico.name} size={18} />
                  </Box>
                ))}
              </Box>
            </div>
            <DialogFooter sx={{ gap: 1 }}>
              <Button variant="outline" type="button" onClick={() => setShowCreateForm(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !name}>
                {createMutation.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </Box>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'error.main',
              opacity: 0.1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 1.5,
            }}
          >
            <Icon name="warning" size={24} sx={{ color: 'error.main' }} />
          </Box>
          <Typography variant="subtitle2">无法连接到服务器</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {error.message}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            请确保后端服务器正在运行
          </Typography>
          <Button onClick={() => queryClient.invalidateQueries(['dashboards'])}>
            <Icon name="refresh" size={16} />
            重试
          </Button>
        </Paper>
      ) : dashboards.length === 0 ? (
        <EmptyState
          icon="dashboard"
          title="暂无仪表盘"
          description="创建您的第一个分析仪表盘开始使用"
          action={
            <Button onClick={() => setShowCreateForm(true)}>
              <Icon name="plus" size={16} />
              创建第一个仪表盘
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {dashboards.map((dashboard, index) => (
            <Paper
              key={dashboard.id}
              elevation={0}
              sx={{
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                transition: 'box-shadow 200ms cubic-bezier(0, 0, 0.2, 1)',
                '&:hover': { boxShadow: (t) => t.shadows[4] },
                animation: 'fade-in-up 0.3s ease-out both',
                animationDelay: `${index * 50}ms`,
              }}
            >
              <Link to={`/dashboards/${dashboard.id}`} style={{ display: 'block', padding: 16, textDecoration: 'none', color: 'inherit' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={(t) => ({
                      width: 40,
                      height: 40,
                      borderRadius: 1,
                      bgcolor: alpha(t.palette.primary.main, 0.08),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    })}
                  >
                    <Icon name={dashboard.icon || 'dashboard'} size={20} sx={{ color: 'primary.dark' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dashboard.name}</Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        mt: 0.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {dashboard.description || '无描述'}
                    </Typography>
                  </Box>
                </Box>
              </Link>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  bgcolor: 'background.paper',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Icon name="chart" size={12} />
                  <Typography variant="caption" color="text.secondary">
                    {dashboard.widget_count ?? 0} 个组件
                  </Typography>
                </Box>
                <Tooltip title="删除仪表盘">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dashboard.id, dashboard.name)}
                    sx={{ height: 28, width: 28, p: 0, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                  >
                    <Icon name="trash" size={16} />
                  </Button>
                </Tooltip>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="移至操作记录"
        message={`"${deleteConfirm.name}" 将移至操作记录，可随时恢复。`}
        confirmText="移至操作记录"
        cancelText="取消"
        isDanger={false}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
      />
    </PageWrapper>
  );
}
