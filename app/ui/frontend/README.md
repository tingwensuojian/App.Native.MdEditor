# Markdown 编辑器前端开发说明

本目录是飞牛 NAS Markdown 编辑器的 React + Vite 前端。运行时并不是纯静态站点：前端通过同源 API 访问 `app/server/server.js`，由后端负责文件系统、SQLite 设置、认证会话、图片/图床、Office 预览、AI 代理与导出辅助能力。

## 架构入口

| 入口 | 作用 |
|------|------|
| `src/main.jsx` | 初始化性能优化、Clipboard 兼容兜底、`proxy.cgi` 路径下的 API 请求重写，并渲染 `AuthBootstrap` |
| `src/components/auth/AuthBootstrap.jsx` | 启动时请求 `/api/auth/me`，决定显示登录页还是主应用 |
| `src/App.jsx` | 主编辑器、文件树、预览、导出、AI 侧栏、图片和 Office 预览等用户工作流 |
| `src/utils/settingsApi.js` | `/api/settings`、`/api/app-state` 的前端封装和导出配置默认值合并 |
| `src/constants/fileFormats.js` | 文件类型识别和 Monaco 语言映射 |
| `vite.config.js` | Vite 开发服务、后端代理、构建分包策略 |

后端关键入口位于 `../../server/`：

- `server.js`：HTTP 服务和主要 API 路由。
- `authRoutes.js` / `authService.js` / `authMiddleware.js`：登录、会话 Cookie、管理员账号初始化。
- `imagebedApi.js` 与 `imagebed/*Adapter.js`：图床配置、上传、缓存和缩略图。
- `officeHandler.js`：DOCX/XLSX 预览抽取和 Office ZIP 安全限制。
- `db.js`：SQLite schema，开发环境写入 `app/var/app.db`，fnOS 环境写入 `${TRIM_PKGVAR}/app.db`。

## 本地开发

### 依赖与启动

```bash
# 后端运行依赖，包含 better-sqlite3、sharp、Office/图床相关 SDK
cd app/server
npm install

# 前端依赖
cd ../ui/frontend
npm install

# 启动后端，默认监听 18089；如需配合 Vite 代理建议指定 18080
cd ../../server
PORT=18080 node server.js

# 另开终端启动前端
cd ../ui/frontend
npm run dev
```

访问 `http://localhost:3000`。Vite 配置使用 `strictPort: true`，端口 3000 被占用时会直接失败，避免浏览器误连到其他服务。

### 常用环境变量

| 变量 | 用途 | 默认值/约束 |
|------|------|-------------|
| `PORT` / `TRIM_SERVICE_PORT` | 后端监听端口；fnOS 控制脚本优先使用向导端口、再看 `TRIM_SERVICE_PORT` | `server.js` 兜底为 `18089`，`cmd/main` 兜底为 `18080` |
| `TRIM_DATA_ACCESSIBLE_PATHS` | 文件树可访问根目录，多个路径用 `:` 分隔 | 开发环境未设置时回退到应用 shares 目录 |
| `TRIM_DATA_SHARE_PATHS` | 历史版本等共享路径解析来源 | 可为空 |
| `TRIM_PKGVAR` | SQLite、字体缓存、缩略图等运行态数据目录 | 开发环境使用 `app/var` |
| `ENABLE_AUTH` | 是否启用 API 鉴权中间件 | 仅字符串 `true` 启用 |
| `AUTH_ADMIN_USERNAME` | 初始化/重命名管理员账号 | `admin` |
| `AUTH_ADMIN_PASSWORD` / `AUTH_DEFAULT_ADMIN_PASSWORD` | 初始化或重置管理员密码 | `admin123456` |
| `AI_CONFIG_ENCRYPTION_KEY` | AI Key 的 AES-GCM 密钥，支持 32 字节 hex 或 44 字节 base64 | 未设置时使用固定盐派生，仅适合单机 |

示例：

```bash
cd app/server
ENABLE_AUTH=true \
AUTH_ADMIN_USERNAME=admin \
AUTH_ADMIN_PASSWORD='change-me' \
TRIM_DATA_ACCESSIBLE_PATHS=/workspace/data \
PORT=18080 \
node server.js
```

## 运行时工作流

### 认证与会话

1. `AuthBootstrap` 请求 `GET /api/auth/me`。
2. 如果后端返回 `401`，前端显示登录页；如果接口不存在返回 `404`，前端按“未启用认证”兼容旧后端。
3. 登录调用 `POST /api/auth/login`，后端校验管理员账号后写入 `md_editor_session` HttpOnly Cookie。
4. `ENABLE_AUTH=true` 时，除 `/api/auth/*` 和 `/api/service-port` 外的 `/api/*` 路由都需要有效会话。

约束：

- 当前实现是单管理员入口，`authRoutes.js` 只允许 `role === 'admin'` 的账号登录。
- 会话有效期为 7 天，服务端只保存 token 哈希。

### fnOS 同源 `proxy.cgi`

fnOS 桌面入口通过 `app/ui/proxy.cgi` 访问后端，形态类似：

```text
/cgi/ThirdParty/App.Native.MdEditor2/proxy.cgi/<path>?<query>
```

`proxy.cgi` 会解析目标端口，优先级为：

1. 查询参数 `service_port`
2. `TRIM_SERVICE_PORT`
3. `PORT`
4. `/var/apps/<app_id>/var/service_port`
5. `/var/apps/<app_id>/config` 中的 `service_port`
6. 兜底 `18080`

前端在 `src/main.jsx` 中识别 `/proxy.cgi/` 基础路径，并把根路径形式的 `/api`、`/health`、`/images`、`/math-svg` 请求改写到同源 proxy 路径，避免 iframe 场景下跨域和 Cookie 丢失。

### 文件、预览与历史

- 文件树读取：`GET /api/files?path=/`
- 文件读取：`GET /api/file?path=<absolute-path>`，二进制/十六进制读取使用 `mode=hex`
- 文件保存：`POST /api/file`，请求体包含 `path` 与 `content`
- 重命名/删除/复制/移动：`/api/file/rename`、`/api/file/delete`、`/api/file/copy`、`/api/file/move`
- 文件夹创建：`POST /api/folder/create`
- 历史版本：`/api/file/history/save|list|version|delete|clear`

支持格式由 `src/constants/fileFormats.js` 控制：

- Markdown：`.md`
- 文本/代码：`.txt`、`.js`、`.ts`、`.json`、`.py`、`.sh`、`.sql` 等
- 图片：`.png`、`.jpg`、`.jpeg`、`.gif`、`.bmp`、`.webp`
- 预览型 Office/PDF：`.pdf`、`.docx`、`.xlsx`、实验性 `.pptx`

Office 预览由后端 `officeHandler.js` 负责。DOCX/XLSX 会先做 ZIP 风险检查；XLSX 支持分页参数 `sheetIndex`、`rowOffset`、`rowLimit`。

### 图片、图床与导出

主要 API：

- 图床配置：`GET /api/imagebed/list`、`POST /api/imagebed/add`、`PUT /api/imagebed/:id`、`DELETE /api/imagebed/:id`
- 默认图床：`GET /api/imagebed/default`、`PUT /api/imagebed/:id/default`
- 上传：`POST /api/image/upload`
- 图片列表/删除：`GET /api/image/list`、`POST /api/image/delete-batch`、`DELETE /api/image/delete`
- 远程图片代理：`GET /api/proxy-image`、`POST /api/image/fetch-url`

支持的图床适配器包括本地、阿里云 OSS、腾讯云 COS、七牛云、MinIO、WebDAV、GitHub、自定义 OSS 和自定义 API。缩略图和本地图片缓存依赖 `${TRIM_PKGVAR}`；Docker 开发时请挂载稳定数据目录，避免重启后丢失缓存。

导出相关设置和主题存储在 SQLite：

- `/api/settings`：全局设置，AI Key 会加密后保存。
- `/api/export-presets`、`/api/export-presets/active`：导出预设。
- `/api/export-themes/*`：自定义导出主题 CSS。
- `/api/math/svg`、`/api/plantuml/svg`：导出时的公式和 PlantUML 渲染辅助。

### AI 对话与文生图

前端 AI 入口在 `src/components/ai/` 与 `src/hooks/ai/`：

- `/api/ai/chat/proxy`：对话代理。
- `/api/ai/models/fetch`：根据服务商配置拉取模型，并过滤音频、ASR、Embedding、TTS 等非对话/图片模型。
- `/api/ai/conversations`、`/api/ai/current-conversation`：会话状态。
- `/api/ai/image/generate`、`/api/ai/image/history`：文生图和历史记录。

约束：

- 普通翻译/改写不应触发主题 CSS 后处理；主题规范化逻辑仅用于“帮我写主题”等主题生成意图。
- 持久化 AI Key 前会通过后端 AES-GCM 加密；生产或可迁移部署应显式设置 `AI_CONFIG_ENCRYPTION_KEY`。

## 构建与打包

前端构建：

```bash
cd app/ui/frontend
npm run build
```

`prebuild` 会运行 `scripts/copy-code-themes.cjs`，复制代码主题资源；构建产物输出到 `app/ui/frontend/dist`，后端静态服务从该目录读取。

完整 FPK 打包推荐使用根目录脚本：

```bash
# 交互选择架构
bash build-fpk-multi-arch.sh

# 单架构
bash build-fpk-multi-arch.sh amd64
bash build-fpk-multi-arch.sh arm64

# 双架构，安全裁剪
bash build-fpk-multi-arch.sh amd64 arm64 --safe
```

打包脚本会：

1. 构建一次前端 dist。
2. 为每个目标架构 staging 文件。
3. 将 staging 中的 `manifest platform` 设置为 `x86`（amd64）或 `arm`（arm64）。
4. 为目标架构安装并重建后端原生依赖 `better-sqlite3`。
5. 生成 `App.Native.MdEditor2-<version>-<arch>.fpk`。

跨架构构建依赖 Docker 和 binfmt；如果提示无法执行目标架构容器，可按错误提示安装 `tonistiigi/binfmt`。

## 常见问题排查

| 现象 | 检查项 |
|------|--------|
| Vite 页面能打开但 API 404/连接失败 | 确认后端运行在 `PORT=18080`，或同步调整 `vite.config.js` 中 `/api` 代理目标 |
| 登录页反复出现 | 确认 `ENABLE_AUTH=true` 时浏览器能保存 `md_editor_session` Cookie；同源 proxy 访问时应包含 `/proxy.cgi/` 基础路径 |
| 默认账号密码不生效 | 如果已有管理员账号，只有设置 `AUTH_ADMIN_PASSWORD` 或 `AUTH_DEFAULT_ADMIN_PASSWORD` 环境变量时才会重置密码 |
| `better-sqlite3` 加载失败 | 在 `app/server` 运行 `npm install`；跨架构 FPK 必须使用打包脚本重建原生模块 |
| Office 预览失败 | 检查文件是否为支持的 `.docx`/`.xlsx`，以及是否触发 ZIP 安全限制或宏风险标记 |
| 图片上传成功但重启后丢失缩略图 | 确认 `${TRIM_PKGVAR}` 或 Docker volume 挂载稳定，图床缓存和缩略图依赖该目录 |
| proxy 模式端口错误 | 检查 `service_port` 查询参数、`TRIM_SERVICE_PORT`、`PORT`、`/var/apps/<app_id>/var/service_port` 和应用 `config` |

