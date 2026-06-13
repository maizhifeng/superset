# 生产容器构建计划：仅替换前端（MUI Vite 替换旧版 Webpack）

## 目标

在原版生产构建配置基础上，仅将前端从旧版 Webpack (`superset-frontend/`) 替换为 MUI Vite (`superset-frontend-new/`)。保持架构不变：Flask/Gunicorn 直接提供一切，无需 nginx。

## 架构（不变）

```
[Browser] ←→ [Flask/Gunicorn :8088]
  ├── /api/* → 现有 API 路由
  ├── 管理路由 → 提供 MUI index.html（代替旧版 spa.html）
  └── /static/* → 提供 MUI 构建资产（代替旧版 assets）
```

## 改动清单

### 1. Dockerfile：替换前端构建阶段

**改动**：将 `superset-node-ci` / `superset-node` 两个阶段替换为 MUI 构建阶段。旧版本地复制 `superset/translations` 的逻辑也保留（但 MUI 不需要翻译文件，可以跳过）。

```dockerfile
# 替换前：
# FROM node:22-trixie-slim AS superset-node-ci    # npm ci (superset-frontend/)
# FROM superset-node-ci AS superset-node           # npm run build → static/assets/

# 替换后：
FROM --platform=${BUILDPLATFORM} node:22-trixie-slim AS superset-node-mui
COPY docker/ /app/docker/
RUN /app/docker/apt-install.sh build-essential python3 zstd
WORKDIR /app/superset-frontend-new
RUN --mount=type=bind,source=./superset-frontend-new/package.json,target=./package.json \
    --mount=type=bind,source=./superset-frontend-new/package-lock.json,target=./package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY superset-frontend-new /app/superset-frontend-new
RUN --mount=type=cache,target=/root/.npm \
    npm run build
```

**`python-common` 阶段改动**：
- 移除 `COPY --from=superset-node /app/superset/static/assets superset/static/assets`
- 移除 `COPY --from=superset-node /app/superset/translations superset/translations`
- 添加 `COPY --from=superset-node-mui /app/superset-frontend-new/dist /app/mui-static`

关键目录：
| 路径 | 内容 |
|---|---|
| `/app/mui-static/` | MUI 构建产物（index.html + assets/*.js + assets/*.css） |
| `/app/docker/` | Docker 脚本和配置（不变） |
| `superset/` | Python 后端代码（不变） |

**保留**：`python-base`、`python-common`、`lean`、`dev`、`ci`、`showtime` 目标结构不变。

### 2. Flask：修改 SPA 渲染逻辑

**唯一需要改动的后端文件**：`superset/views/base.py`

函数 `render_app_template()` 当前渲染 `spa.html`（JINJA 模板，注入 bootstrap_data）。改为当 `/app/mui-static/index.html` 存在时，直接返回该文件内容。

```python
# superset/views/base.py
from pathlib import Path

MUI_INDEX = Path("/app/mui-static/index.html")

def render_app_template(self, ...):
    if MUI_INDEX.exists():
        # 生产环境：直接提供 MUI 的 index.html，不注入 bootstrap_data
        return Response(
            MUI_INDEX.read_text(encoding="utf-8"),
            mimetype="text/html",
        )
    # 开发/回退：渲染旧的 spa.html
    context = get_spa_template_context(entry, extra_bootstrap_data, **template_kwargs)
    return self.render_template("superset/spa.html", **context)
```

**为什么可行**：MUI 前端不依赖服务端 `bootstrap_data`。它通过 `authStore` 和 API 调用自行初始化（登录态、用户信息、主题等）。`spa.html` 所用的 JINJA 变量（`assets_prefix`、`entry`、`spinner_svg` 等）在 MUI 中由 Vite 的 `index.html` 处理。

**影响范围**：
- `SupersetIndexView.index()` → 渲染 MUI index.html ✓
- `Superset.welcome()` → 渲染 MUI index.html ✓
- `Superset.explore()` → 渲染 MUI index.html ✓
- `Dashboard.dashboard()` → 渲染 MUI index.html ✓
- `SqlLab.sql_lab()` → 渲染 MUI index.html ✓
- 所有 `render_app_template()` 的 SPA 路由 → 都使用 MUI ✓

**补充**：还需要添加一个静态文件路由，用于提供 MUI 的 JS/CSS 等构建资产。

```python
# 在 Flask app 初始化中（initialization/__init__.py）
from flask import send_from_directory

@self.superset_app.route("/static/mui/<path:filename>")
def serve_mui_assets(filename):
    return send_from_directory("/app/mui-static/assets", filename)
```

但更简洁的方式：将 MUI `dist/` 直接复制到 `superset/static/mui/`（Flask 自动提供 `superset/static/` 下的文件），这样 `/static/mui/assets/xxx.js` 自动可访问。

### 3. Docker Compose（生产）

在 `docker-compose-non-dev.yml` 基础上仅改构建目标：

```yaml
x-common-build: &common-build
  context: .
  target: lean       # 不变，lean 目标现在只包含 MUI 前端
  # DEV_MODE 不需要，lean 目标中没有 DEV_MODE
```

无需添加新服务或卷。所有其他服务（redis、db、superset、superset-init、worker、beat）保持不变。

`superset` 服务继续使用 `command: ["/app/docker/docker-bootstrap.sh", "app-gunicorn"]`，通过 gunicorn 运行 Flask。

### 4. Pythonpath 配置

**修改 `docker/pythonpath_dev/superset_config.py`**（或新建生产配置）：

当前配置中 `DEV_MODE` 相关逻辑（可编辑安装 `superset-core`）应该移除或仅用于开发。`SUPERSET_ENV=production` 环境变量已在 Dockerfile 中设置。

生产所需关键配置（从环境变量读取）：
```
SUPERSET_SECRET_KEY     # 必填，生产环境
SUPERSET_CONFIG_PATH    # 指向 /app/docker/pythonpath_prod/superset_config_prod.py
```

## 不变的内容

| 项目 | 状态 |
|---|---|
| Python 后端代码 | 不变（除 `base.py` 中少量改动） |
| `pyproject.toml` / `setup.py` | 不变 |
| `requirements/` | 不变 |
| `docker/entrypoints/` | 不变 |
| `docker/docker-bootstrap.sh` | 不变 |
| `docker/docker-init.sh` | 不变 |
| `docker-compose-non-dev.yml` | 仅改 `target` |
| `.dockerignore` | 检查是否需要调整 |
| 现有开发环境 `docker-compose-light.yml` | 不变 |

## 构建与运行

```bash
# 构建
docker build -t superset-mui:latest --target lean .

# 启动
docker compose -f docker-compose-non-dev.yml up -d

# 访问 http://localhost:8088
```

## 风险与注意事项

1. **MUI 前端构建**：`npm run build` 包含 `tsc --noEmit && vite build`，TypeScript 类型检查会阻止有错误的构建
2. **后向兼容**：旧的 SPA 路由仍然通过 MUI 的 React Router 处理。如果 MUI 未实现某个路由（如旧的 Flask-Admin 页面），仍然可以通过 API 访问
3. **superset_config**：需要确保 `SUPERSET_CONFIG_PATH` 指向带 `ENABLE_PROXY_FIX` 的配置（如果需要通过反向代理部署）
4. **旧版前端残留**：删除 `superset/static/assets/` 下的所有文件（它们已包含在 git 历史记录中，不影响构建），Docker 镜像中不再包含这些文件
