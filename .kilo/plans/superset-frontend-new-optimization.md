## 未完成项（优先级低）

| 项目 | 原因 |
|------|------|
| Dashboard filter loading 优化 | ✅ 使用 refs 消除回调闭包依赖，`refreshChart`/`refreshCharts`/`handleFilterChange` 不再依赖 `chartMeta` 状态 |
| 字体加载优化 | 需服务器配置或自托管 |

## 本日追加完成项

| 项目 | 状态 |
|------|------|
| `allowJs: true` 移除 | ✅ 无遗留 .js 文件 |
| `contexts/ToolbarContext.tsx` → `store/toolbarStore.ts` | ✅ 15 个 import 更新 |
| `getScrollbarWidth()` 模块级缓存 | ✅ |
| ChartEditor datasets 会话缓存 | ✅ |
| `fetchNavItems` 30s TTL 缓存 | ✅ |
| gzip/brotli 构建压缩 | ✅ |
