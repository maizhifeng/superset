# 全局路由开关：/system/admin 菜单开关改为服务端持久化 + 全局路由拦截

## 目标

`/system/admin?tab=menu`（`Settings` 页）里的每行开关目前只控制侧边栏图标显隐（由 `menuSettings.enabled` 驱动 `useNavManager` 过滤），路由在 `App.tsx` 中始终注册、可直接访问。本次改动：

1. 开关关闭 = 该路由全局不可访问：直接输入 URL、收藏、快捷键、详情/子路由等所有入口都被 `ProtectedRoute` 拦截，显示现有「权限不足」页（`src/pages/Forbidden`）。
2. 配置持久化到后端（所有用户、所有浏览器生效），不再只存在当前浏览器 localStorage。
3. `/`（首页）和 `/system/admin`（固定入口，用于恢复配置）永不被开关拦截。

## 已确认决策

| 项目 | 决策 |
| --- | --- |
| 生效范围 | 后端持久化，对所有用户生效（用户已确认） |
| 拦截表现 | 显示「权限不足」页（复用 `src/pages/Forbidden`，用户已确认） |
| 首次默认值 | 沿用当前 `defaultEnabled`：`sqllab`、`saved_query/list`、`alert/list`、`query_history` 默认关（上线后这 4 个路由全局不可访问），其余默认开（用户已确认） |
| 管理员豁免 | 不豁免：开关对所有人生效（含 Admin）；仅 `/system/admin` 与 `/` 固定放行 |
| 与单用户路由覆盖的关系 | 全局开关优先级最高；`userRouteOverrides` 里 `true` 不能重新放开被全局关闭的路由 |
| 保存方式 | 操作开关/排序即自动 PUT 保存（乐观更新；失败提示并回滚到服务端状态） |
| 边界 | 这是前端路由级 UX 门禁，不是安全边界：不阻止直接调用后端 API；数据权限仍由 Superset RBAC 负责（范围外） |
| 实时性 | 其他用户已打开的 SPA 需刷新/重新登录后生效（不做 WebSocket 推送） |

> 若「管理员豁免」或「自动保存」不符合预期，实现前需先调整本节。

## 路由 → 菜单项映射（新配置文件）

| 菜单 id | 覆盖的路由 pattern |
| --- | --- |
| `dashboards` | `/dashboard/list`、`/dashboard/:id` |
| `charts` | `/chart/list`、`/explore`、`/explore/*` |
| `sqllab` | `/sqllab` |
| `datasets` | `/dataset/list`、`/dataset/create`、`/dataset/edit/:id` |
| `database/list` | `/database/list`、`/database/:id` |
| `saved_query/list` | `/saved_query/list` |
| `alert/list` | `/alert/list` |
| `query_history` | `/query_history` |
| `project_config` | `/project/settings` |
| `briefing` | `/briefing`、`/briefing/:id` |
| 不映射（恒放行） | `/`、`/system/admin`、`/login`、`legacyRedirects` 的各路径（仅 `<Navigate>`，不渲染页面） |

## 实现任务（按顺序）

### 后端（先部署后端，前端可容忍接口不存在）

1. 新建 `superset/project/menu/__init__.py`（空文件，带 ASF license header）。

2. 新建 `superset/project/menu/store.py`（复用 `KeyValueEntry`，无需 DB migration，参照 `superset/project/briefing/store.py`）：
   - `RESOURCE = "menu_settings"`（`resource` 字段 String(32)，长度足够）。
   - `get_menu_settings() -> dict[str, Any] | None`：取该 resource 最新一行，JSON decode；无记录返回 `None`。
   - `save_menu_settings(payload: dict[str, Any], user_id: int | None) -> dict[str, Any]`：有记录则更新（`changed_on`/`changed_by_fk`），否则插入（`created_on`/`created_by_fk`）；返回保存后的 payload。
   - `normalize_menu_settings(raw: Any) -> dict[str, Any]`：校验并规整为 `{"items": [...], "enabled": {...}}`；`items` 必须为 list，每项至少含 string 的 `id`/`path`/`label`（`builtIn` 可选 bool）；`enabled` 必须为 `dict[str, bool]`；非法时抛 `ValueError`。
   - 全部带类型注解（mypy）。

3. 新建 `superset/project/menu/api.py`：
   - `menu_blueprint = Blueprint("menu_settings", __name__, url_prefix="/api/v1/menu")`（与 `project/*` 蓝图风格一致）。
   - 认证辅助函数：复制 `superset/views/users/api.py:115-134`（impersonate）的 JWT 校验模式：
     ```python
     def _authenticated_user() -> Any | None:
         from flask_jwt_extended import get_jwt, verify_jwt_in_request
         from superset import security_manager
         try:
             verify_jwt_in_request()
         except Exception:
             return None
         try:
             sub = get_jwt().get("sub")
             return security_manager.get_user_by_id(int(sub)) if sub else None
         except (TypeError, ValueError):
             return None
     ```
     `_is_admin(user)`：`"Admin" in [role.name for role in getattr(user, "roles", [])]`。
   - `GET /api/v1/menu/settings`：未认证返回 `{"error": "unauthorized"}` + 401；无配置返回 `{"result": None}` + 200；有配置返回 `{"result": {...}}` + 200（响应形态对齐 `superset/project/briefing/api.py:85-104`）。
   - `PUT /api/v1/menu/settings`：401（未认证）/ 403（非 Admin）/ 400（`normalize_menu_settings` 抛 `ValueError`）/ 200 `{"result": {...}}`；`request.get_json(force=True)`。
   - 返回 `{"result": null}` 时前端使用代码默认值，后端不保存默认副本。

4. 修改 `superset/initialization/__init__.py`：
   - `register_blueprints()` 中（`briefing_blueprint` 注册之后，约 line 1039 后）注册 `menu_blueprint`。
   - `configure_wtf()` 的 CSRF 豁免块（约 line 999 后）加 `csrf.exempt("superset.project.menu.api.put_menu_settings")`，与其它自研可变端点一致。

5. 新建 `tests/unit_tests/project/test_menu_settings.py`（参照 `tests/unit_tests/project/test_bi_api.py` 的纯函数单测风格）：
   - `normalize_menu_settings`：合法 payload 通过；缺 `items` / `enabled` 类型错误 / item 缺字段时 `ValueError`；未知 item 字段被丢弃。
   - store 的 JSON 编解码 round-trip（mock `db.session` 或直接测 `_encode/_decode` 辅助函数）。
   - `_is_admin` 用假 user 对象验证。

### 前端

6. 新建 `superset-frontend-new/src/config/menuRoutes.ts`：
   - 导出 `menuRouteRules: { path: string; menuId: string }[]`（见上方映射表），顺序把静态路径放在动态路径前。
   - `resolveMenuId(pathname: string): string | null` 用 `matchPath({ path, end: true }, pathname)` 逐个匹配，未命中返回 `null`。

7. 修改 `superset-frontend-new/src/components/ProtectedRoute.tsx`：
   - 读取 `useMenuSettings((s) => s.enabled)`；在 `loading` / `!isAuthenticated` 判断之后、`requiredRoles` 逻辑之前插入：
     ```tsx
     const menuId = resolveMenuId(location.pathname);
     if (menuId && enabled[menuId] === false) {
       return <Forbidden />;
     }
     ```
   - 用 `=== false`（缺失 id 默认放行，与侧边栏 `enabled[item.id] ?? true` 语义一致）。

8. 修改 `superset-frontend-new/src/store/menuSettings.ts`：
   - 新增 action `fetchSettings(): Promise<void>`：`api.get("/menu/settings")` 成功后 `set({ ...mergeDefaults(res.data?.result ?? undefined) })`（服务端返回 null → 代码默认值；成功时以服务端为准，覆盖本地缓存/本地改动）；失败静默保留当前缓存/默认值（fail-open）。
   - 新增 action `saveSettings(): Promise<void>`：`api.put("/menu/settings", { items, enabled })`；失败向上抛，由调用方提示。
   - 保留 zustand `persist`（key `superset-menu-settings`）作为离线/接口不可用时的缓存；`mergeDefaults` 继续用于清洗服务端与本地数据（保留 deprecated/fixed 清理逻辑）。
   - 现有 `toggle`/`moveItem`/`removeItem`/`reset` 保持纯状态更新，不改签名（避免破坏现有测试）。

9. 修改 `superset-frontend-new/src/store/authStore.ts`：
   - 在 `init()`（两个成功分支）与 `login()` 中 `await _get().fetchRoles()` 之后调用 `await useMenuSettings.getState().fetchSettings()`；用 try/catch 吞掉异常（接口 404/网络失败时保持默认，不阻塞登录）。
   - 注意别引入循环依赖：`menuSettings` 只依赖 `@/api`，不依赖 authStore。

10. 修改 `superset-frontend-new/src/pages/Settings/index.tsx`：
    - `toggle` / `moveItem` / `reset` 之后调用 `saveSettings()`；失败时 `notify({ severity: "error", message: "保存失败，已恢复服务器配置" })` 并 `fetchSettings()` 回滚。
    - 表头「可见」改为「启用」，`PageHeader` subtitle 改为「导航与路由管理」，并加一行说明：关闭后所有用户都无法访问该路由（含直接输入 URL）。
    - 「复制配置」「恢复默认菜单」保留；`reset` 同样持久化默认配置到后端。

11. 可选（避免误导）：`superset-frontend-new/src/pages/AdminUsers/index.tsx` 路由权限弹窗说明（约 line 863）补一句「全局菜单开关关闭的路由，此处放行无效」。

12. 前端测试：
    - 新建 `src/config/__tests__/menuRoutes.test.ts`：静态/动态/未映射路径。
    - 扩展 `src/components/__tests__/ProtectedRoute.test.tsx`：`useMenuSettings.setState({ enabled: { dashboards: false } })` 且 `initialEntries=["/dashboard/list"]` → 出现「权限不足」；`enabled: true` → 渲染 children；未映射路径（`/`）不受影响。
    - 扩展 `src/store/__tests__/menuSettings.test.ts`：mock `@/api`，验证 `fetchSettings` 成功覆盖状态、返回 null 用默认值、失败保留现值；`saveSettings` PUT 的 payload。

## 验证

```bash
# 前端（在 superset-frontend-new 下）
npm run test
npm run type
npm run lint

# 后端
pytest tests/unit_tests/project/test_menu_settings.py

# 提交前（按 AGENTS.md，先 git add）
pre-commit run --files <changed files>
```

手工验收：
1. 后端无配置时打开 `/system/admin?tab=menu`，开关显示为当前默认值（sqllab/saved_query/alert/query_history 关）。
2. 用管理员关闭「仪表板」→ 直接访问 `/dashboard/list`、`/dashboard/1`、快捷键 `g b` 均显示「权限不足」；侧边栏入口消失。
3. 重新打开开关 → 路由恢复访问，其它浏览器/用户刷新后同步。
4. 关闭 `sqllab` 后 `/sqllab` 被拦截，侧边栏入口消失（overlay 入口同样不可达）。
5. `/`、`/system/admin` 始终可访问（管理员）。
6. 非管理员 PUT 返回 403；未登录 GET 返回 401。

## 失败模式与回滚

- 后端未部署/接口 404：`fetchSettings` 失败 → 前端保持代码默认值，行为退化为「仅侧边栏过滤」（即当前行为），不会锁死用户。
- GET 返回 null（首次部署）：前端用 `defaultEnabled`，与现状开关显示一致。
- PUT 失败：提示错误并回滚为服务端状态；不影响其它用户。
- 并发编辑：最后一个 PUT 生效（last-write-wins），不做版本冲突检测。
- 回滚：前端回退即可恢复旧行为；后端 `key_value` 中的 `menu_settings` 行可保留（不影响其它功能），必要时手动删除该行。
- 现有浏览器 localStorage 里的旧配置：服务端一旦有配置即被覆盖；第一次由管理员操作开关时会以当前本地状态为基准 PUT 到服务端，可视为一次性迁移。

## 范围外

- 不按菜单开关拦截后端数据 API（仍由 RBAC 控制）。
- 不做多标签页/多用户实时推送。
- 不改 per-user `userRouteOverrides` 存储；不做 `rolePermissions` 动态化。
- 不改首页卡片/快捷键列表的显隐（点击后由路由守卫拦截即可）。

## 关键代码引用

- 开关 UI：`superset-frontend-new/src/pages/Settings/index.tsx:203-209`、`:32-41`
- store 与持久化：`superset-frontend-new/src/store/menuSettings.ts:86-193`
- 侧边栏消费：`superset-frontend-new/src/components/AppLayout/useNavManager.ts:55-88`
- 路由注册：`superset-frontend-new/src/views/App.tsx:47-79,201-214`
- 现有守卫：`superset-frontend-new/src/components/ProtectedRoute.tsx:44-68`
- 角色权限：`superset-frontend-new/src/config/routePermissions.ts`
- 前端登录/JWT：`superset-frontend-new/src/store/authStore.ts:68-134`、`src/api/client.ts`
- JWT 校验范例：`superset/views/users/api.py:115-134`
- KeyValue 复用范例：`superset/project/briefing/store.py`；模型 `superset/key_value/models.py:29-42`
- 蓝图注册/CSRF：`superset/initialization/__init__.py:970-999,1012-1039`
