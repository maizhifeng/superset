export const docs: Record<string, { title: string; content: string }> = {
  manual: {
    title: "使用手册",
    content: `# Starfly 使用手册

> Starfly 是一个商业智能平台，提供数据探索、可视化分析、仪表盘等能力。

## 快速导航

- **仪表盘**: 可视化拖拽布局，支持图表比较、筛选联动
- **图表制作**: 常用图表类型，精简操作流程
- **SQL 实验室**: 多标签页 SQL 编辑器，支持自动补全和格式化
- **数据集**: 物理/虚拟数据集管理，列级元数据配置

## 核心功能

### 仪表盘
- 可视化拖拽布局，支持移动端适配
- 图表比较模式：并排对比不同维度的数据
- 全局筛选器：时间范围 + 维度筛选，跨图表联动

### 图表制作
- 聚焦常用类型：折线图、柱状图、饼图、表格、大数字
- 精简操作流程：选数据集 → 选类型 → 配字段 → 出图
- 自动推荐图表类型（基于数据特征）
- 快捷键：Ctrl+Enter 运行，Ctrl+S 保存

### SQL 实验室
- CodeMirror 6 SQL 编辑器
- SQL 语法高亮、自动补全（表名、列名、关键字）
- SQL 格式化
- 数据库浏览器：数据库 → 模式 → 表 → 列树形展开
- 右键菜单插入表名/列名到编辑器
- 查询结果分页展示
- 保存为虚拟数据集

### 数据集管理
- **物理数据集**: 从数据库表映射
- **虚拟数据集**: 从 SQL 查询结果创建
- 列配置：类型、显示名、是否日期、是否可筛选
- 指标管理：创建自定义计算指标
- 日期列自动检测（YYYYMMDD、Unix 时间戳等格式）


`,
  },
  architecture: {
    title: "技术架构",
    content: `# Starfly 技术架构

## 前端架构

- React 18 + TypeScript + Material UI
- Vite 构建，Zustand 状态管理
- ECharts 图表、CodeMirror 6 SQL 编辑器
- react-grid-layout 仪表盘布局

## 后端架构

- **数据 API**: Starfly REST API（/api/v1/）
- **认证**: JWT Token + Refresh Token 自动刷新
- **代理转发**: Vite dev server 代理（/api -> backend）

## Docker 部署

Starfly 采用 Docker Compose 统一管理所有服务容器：

- **starfly-web**: Starfly 前端 SPA（Nginx + Vite build 产物）
- **superset**: Starfly 后端 API 服务
- **postgres**: 元数据与业务数据库
- **redis**: 缓存与消息队列
`,
  },
};

export function getDocTitle(docKey: string): string {
  return docs[docKey]?.title ?? "";
}
