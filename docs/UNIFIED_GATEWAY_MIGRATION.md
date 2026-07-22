# App.Native.MdEditor2 统一网关迁移文档

## 1. 文档目的

本文档用于指导 `App.Native.MdEditor2` 从现有的 CGI + 固定 TCP 端口访问模式迁移到飞牛 fnOS 统一网关。

迁移涉及应用入口、启动脚本、Node.js 后端、React/Vite 前端和 FPK 构建流程。上述环节必须使用同一套 Socket 与 URL 前缀约定，不能只修改单个配置文件。

本文档基于以下信息整理：

- 项目当前 `master` 分支代码，版本 `1.31.1`。
- 文章《如何在飞牛中使用统一网关》，最后更新时间为 2026-07-20。
- 当前项目目录、启动脚本、后端路由、前端资源路径和打包脚本的静态检查结果。

> 文章属于社区实践资料。Socket 权限、网关转发时是否保留路径前缀、应用标识符格式等细节，应在实施前结合飞牛官方开发者文档和目标 fnOS 版本进行确认。

### 当前实施状态（2026-07-22）

首轮代码迁移已采用以下参数：

```text
gatewaySocket = mdeditor2.sock
gatewayPrefix = /app/App-Native-MdEditor2
frontend base = /app/App-Native-MdEditor2/
```

统一网关由 fnOS 1.1.3100 引入，`manifest` 必须声明
`os_min_version=1.1.3100` 或更高。若仍声明兼容旧版系统，应用中心会忽略
`gatewaySocket` 和 `gatewayPrefix`，最终表现为入口路径返回 404。

统一网关主入口的服务名必须使用 `${appname}.Application`。普通桌面入口可以使用
其他服务名，但应用中心不会为诸如 `${appname}.Proxy.Application` 的非标准主入口
写入网关 Socket 和 Prefix。

手工安装的第三方包必须将主网关入口配置为 `allUsers: false`。fnOS 会拒绝为
`allUsers: true` 的手工包主入口写入 Socket 和 Prefix。建议同时将 `accessPerm`
和 `fullUrlPerm` 设为 `readonly`，与系统中已注册的手工网关应用保持一致。

已完成入口配置、Unix Socket 启动、后端前缀兼容、前端运行时 URL 兼容、Office 网关地址和正式构建脚本改造。尚未完成 fnOS 实机安装、网关 Socket 权限确认和完整功能回归，因此本文档中的实机验收项仍保持未勾选状态。

## 2. 迁移范围

### 2.1 包含范围

- 飞牛桌面应用入口配置。
- 服务启动、停止和状态检查脚本。
- Node.js HTTP 服务监听方式。
- 后端 URL 前缀处理。
- Vite 构建基础路径。
- 前端 API 和静态资源 URL。
- Office Editor、PDF、WASM、MathJax、字体和图片资源。
- 单架构与多架构 FPK 构建脚本。
- fnOS 实机安装与回归验证。

### 2.2 不包含范围

- 编辑器业务功能重构。
- 数据库结构调整。
- 用户数据或共享目录迁移。
- AI、图床等第三方服务协议变更。
- Office Editor 本身的功能升级。

## 3. 当前状态

### 3.1 当前请求链路

```text
浏览器
  -> /cgi/ThirdParty/App.Native.MdEditor2/index.cgi/
  -> app/ui/index.cgi
  -> curl http://127.0.0.1:18080
  -> app/server/server.js
```

当前模式依赖以下组件：

- `app/ui/config` 注册 CGI URL。
- `app/ui/index.cgi` 将请求代理到本机 TCP 端口。
- `cmd/main` 读取 `wizard_port` 或 `TRIM_SERVICE_PORT`。
- `server.js` 监听 `0.0.0.0:PORT`。
- 前端运行时识别 `/index.cgi/`，并重写部分根路径请求。

### 3.2 当前关键配置

`app/ui/config` 当前未配置统一网关字段：

```json
{
  "type": "iframe",
  "protocol": "http",
  "port": "",
  "url": "/cgi/ThirdParty/App.Native.MdEditor2/index.cgi/"
}
```

`manifest` 当前仍声明固定服务端口：

```ini
service_port=18080
checkport=false
```

`cmd/main` 当前通过 `PORT` 启动后端：

```bash
PORT="${wizard_port:-${TRIM_SERVICE_PORT:-18080}}"
PORT="${PORT}" node "${TRIM_APPDEST}/server/server.js"
```

`server.js` 当前监听所有网络接口：

```js
server.listen(PORT, '0.0.0.0')
```

`vite.config.js` 当前使用相对构建路径：

```js
base: './'
```

### 3.3 已具备的迁移基础

- Node.js 原生 `http.Server` 支持通过文件路径监听 Unix Socket。
- 后端业务路由集中在一个 HTTP 服务中，可以在入口处统一处理网关前缀。
- Vite 静态资源已大量使用 `%BASE_URL%` 或 `import.meta.env.BASE_URL`。
- 当前 FPK 打包结构已经包含 `app/server`、`app/ui`、`cmd`、`config`、`wizard` 和 `manifest`。
- 项目已有 CGI 路径重写经验，可以将该逻辑收敛为通用 URL 工具。

### 3.4 当前差距

| 环节 | 统一网关要求 | 当前实现 | 状态 |
| --- | --- | --- | --- |
| 应用入口 | `gatewaySocket` | 未配置 | 待迁移 |
| 应用入口 | `gatewayPrefix` | 未配置 | 待迁移 |
| 访问地址 | `/app/<应用标识>` | CGI URL | 待迁移 |
| 服务监听 | Unix Socket | TCP 端口 | 待迁移 |
| 启动环境 | `FNNAS_GATEWAY_SOCKET` | `PORT` | 待迁移 |
| 后端路由 | 识别网关前缀 | 仅识别 `/api/*` 等根路径 | 待迁移 |
| Vite base | 明确的网关前缀 | `./` | 部分兼容 |
| API URL | 基于应用前缀 | 混用 `/api/*` 与 `api/*` | 待迁移 |
| 构建脚本 | 注入统一 base | 仅注入版本号 | 待迁移 |
| 打包目录 | 标准 FPK 目录 | 已具备 | 可复用 |

## 4. 目标架构

### 4.1 目标请求链路

```text
浏览器
  -> fnOS 统一网关
  -> /app/<应用标识>
  -> Unix Socket
  -> Node.js HTTP 服务
  -> 静态资源或 API 路由
```

统一网关负责外部访问入口，应用不再向局域网暴露固定端口。

### 4.2 建议的统一参数

实施前应确定并冻结以下参数：

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 应用名 | `App.Native.MdEditor2` | 现有 manifest appname |
| Socket 文件名 | `mdeditor2.sock` | 安装到应用 target 目录 |
| 网关前缀 | `/app/App-Native-MdEditor2` | appname 中的点号转为连字符，并保留大小写 |
| 前端 base | `/app/App-Native-MdEditor2/` | 必须保留末尾 `/` |

如果 fnOS 对网关标识符有限制，建议统一改用：

```text
Socket: mdeditor2.sock
Prefix: /app/App-Native-MdEditor2
Base:   /app/App-Native-MdEditor2/
```

一旦确定，入口配置、启动脚本、后端和前端必须全部采用同一值。

### 4.3 兼容策略

建议后端保留本地开发 TCP 回退：

```text
存在 FNNAS_GATEWAY_SOCKET -> 监听 Unix Socket
不存在 FNNAS_GATEWAY_SOCKET -> 监听 127.0.0.1:PORT
```

生产 FPK 必须使用 Unix Socket。TCP 回退仅用于本地开发和迁移期诊断，不应继续作为 fnOS 正式入口。

## 5. 迁移实施步骤

### 5.1 阶段一：冻结路径约定

1. 根据官方文档确认 Socket 文件名和网关前缀允许的字符。
2. 确认目标 fnOS 版本支持 `gatewaySocket`、`gatewayPrefix`。
3. 确认网关转发给后端时是否保留完整 `gatewayPrefix`。
4. 将最终参数记录为构建和运行时唯一配置源。

完成标准：所有模块不再分别维护硬编码的网关前缀。

### 5.2 阶段二：修改应用入口

修改 `app/ui/config`，用统一网关字段替代 CGI URL。目标结构示例：

```json
{
  ".url": {
    "App.Native.MdEditor2.Application": {
      "title": "Markdown 编辑器",
      "icon": "images/icon-{0}.png",
      "type": "iframe",
      "protocol": "",
      "gatewaySocket": "mdeditor2.sock",
      "gatewayPrefix": "/app/App-Native-MdEditor2",
      "url": "/app/App-Native-MdEditor2",
      "allUsers": false
    }
  }
}
```

注意事项：

- `gatewaySocket` 只填写 Socket 文件名还是相对路径，应以官方规范为准。
- `gatewayPrefix` 与 `url` 应保持一致。
- 不再配置 TCP `port`。
- `type` 继续使用 `iframe`，以保持当前桌面窗口行为；如改用 `url`，需要单独验证窗口集成。

### 5.3 阶段三：改造启动脚本

修改 `cmd/main`：

1. 在 `TRIM_APPDEST` 下生成 Socket 绝对路径。
2. 启动前删除遗留 Socket。
3. 导出 `FNNAS_GATEWAY_SOCKET`。
4. 导出 `FNNAS_GATEWAY_PREFIX`。
5. 启动后等待 Socket 文件创建成功。
6. 根据 fnOS 权限模型设置 Socket 权限。
7. 停止进程后清理 Socket 和 PID 文件。

示意逻辑：

```bash
GATEWAY_SOCKET="${TRIM_APPDEST}/mdeditor2.sock"
GATEWAY_PREFIX="/app/App-Native-MdEditor2"

rm -f "${GATEWAY_SOCKET}"
export FNNAS_GATEWAY_SOCKET="${GATEWAY_SOCKET}"
export FNNAS_GATEWAY_PREFIX="${GATEWAY_PREFIX}"

node "${TRIM_APPDEST}/server/server.js" >> "${LOG_FILE}" 2>&1 &
```

Socket 权限必须采用满足网关访问所需的最小权限。社区文章使用宽松权限只能作为诊断手段，不应在未确认网关用户和用户组之前直接作为最终方案。

### 5.4 阶段四：改造后端监听

修改 `app/server/server.js`，读取：

```text
FNNAS_GATEWAY_SOCKET
FNNAS_GATEWAY_PREFIX
```

建议监听逻辑：

```js
const socketPath = process.env.FNNAS_GATEWAY_SOCKET

if (socketPath) {
  server.listen(socketPath, onListening)
} else {
  server.listen(PORT, '127.0.0.1', onListening)
}
```

后端还应处理：

- Socket 父目录不存在时创建目录。
- 启动前或绑定失败时输出可诊断日志。
- 收到 `SIGTERM`、`SIGINT` 时关闭服务并清理 Socket。
- 不再在 fnOS 正式运行时绑定 `0.0.0.0`。

### 5.5 阶段五：统一后端路由前缀

当前后端直接判断 `parsed.pathname === '/api/...'`。不建议逐个修改数十个路由判断。

建议在解析 URL 后统一标准化路径：

```text
原始路径: /app/App-Native-MdEditor2/api/file
应用前缀: /app/App-Native-MdEditor2
内部路径: /api/file
```

推荐规则：

- 路径等于网关前缀时转换为 `/`。
- 路径以 `<gatewayPrefix>/` 开头时移除前缀。
- 本地开发时继续接受无前缀路径。
- 不接受相似但不完整的前缀，避免错误路由。
- 查询字符串不参与前缀裁剪。

需要通过实机验证网关是否已经移除前缀。如果网关传入的本来就是 `/api/file`，后端只需兼容两种形式，不能再次错误裁剪。

### 5.6 阶段六：统一前端基础路径

修改 `vite.config.js`：

```js
export default defineConfig({
  base: process.env.VITE_APP_BASE_URL || '/',
})
```

生产构建时设置：

```bash
VITE_APP_BASE_URL=/app/App-Native-MdEditor2/
```

需要注意：

- 末尾 `/` 不可省略。
- 本地 Vite 开发环境继续使用 `/`。
- 不再依赖 `./` 偶然适配不同路径。
- `%BASE_URL%`、动态 import、PDF worker 和字体路径应在构建产物中指向网关前缀。

### 5.7 阶段七：收敛前端 URL 生成

当前项目混用以下形式：

```js
fetch('/api/file')
fetch('api/file')
fetch(`${someBase}/api/file`)
```

应建立单一工具，例如：

```js
export function appUrl(pathname) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`
}
```

所有内部地址必须通过统一工具生成，包括：

- `/api/*`
- `/health`
- `/images/*`
- `/math-svg/*`
- `/font-cache/*`
- `/office-editor/*`
- `/wasm/*`
- PDF worker
- MathJax 和代码主题

外部 URL、`data:` URL、`blob:` URL 和用户输入的图床 URL不得添加应用前缀。

现有 `window.fetch` CGI 重写可以在迁移期保留兼容分支，但最终应由显式 URL 工具承担主要职责，避免只对部分请求生效。

### 5.8 阶段八：改造构建脚本

至少需要同步检查：

- `scripts/build-fpk-fast.sh`
- `scripts/build-fpk-multi-arch.sh`
- 其他会调用 `npm run build` 并生成正式 FPK 的脚本。

构建前统一导出：

```bash
export VITE_APP_VERSION="${MANIFEST_VERSION}"
export VITE_APP_BASE_URL="/app/App-Native-MdEditor2/"
```

不应只修改一个打包脚本，否则快速构建、多架构构建和部署脚本可能生成不同路径规则的前端产物。

### 5.9 阶段九：处理旧 CGI 和端口配置

统一网关验证通过前，保留 `app/ui/index.cgi` 便于回滚。正式切换后：

- `app/ui/config` 不再引用 CGI。
- `cmd/main` 不再依赖 `wizard_port`。
- 评估删除 `manifest` 中的 `service_port`。
- 评估删除端口配置向导及相关回调。
- 评估停止打包 `app/ui/index.cgi`。
- 删除前端 `window.__APP_SERVICE_PORT__` 依赖。

这些清理工作应在新链路完成回归后单独提交，避免迁移和清理同时发生导致回滚困难。

## 6. 专项风险

### 6.1 Office Editor

Office Editor 是本项目相较社区文章示例最大的额外风险。必须验证：

- `/office-editor/` iframe 地址。
- `/wasm/` 下的 JS、WASM 和 data 文件。
- `/api/office/editor/status`、`save`、`deploy`。
- `embedOrigin`。
- 新窗口打开 Office 文件。
- Office HTML 中的相对资源地址。

### 6.2 登录和 Cookie

必须验证：

- 登录、退出和会话恢复。
- Cookie 的 `Path`、`SameSite` 和 `Secure` 属性。
- iframe 环境下 Cookie 是否正常携带。
- 网关是否增加或删除认证相关请求头。

### 6.3 静态资源

重点检查：

- Vite hash 资源。
- 动态 import chunk。
- KaTeX 字体。
- MathJax 文件。
- 代码主题 CSS。
- PDF.js worker。
- 图片和 Markdown 内嵌资源。

### 6.4 路由与刷新

需要验证首页、深层地址和浏览器刷新：

```text
/app/<应用标识>/
/app/<应用标识>/office-editor/
/app/<应用标识>/api/file
```

SPA 回退不能吞掉真实 API 404，也不能把缺失静态文件错误返回为 `index.html`。

### 6.5 Socket 生命周期与权限

常见故障包括：

- 上次异常退出遗留 Socket。
- Socket 父目录不存在。
- 应用用户无权创建 Socket。
- 飞牛网关无权连接 Socket。
- 进程已退出但 PID 或 Socket 仍存在。
- 升级安装后旧 Socket 未清理。

## 7. 测试与验收

### 7.1 构建前静态检查

- [ ] `gatewaySocket` 已配置。
- [ ] `gatewayPrefix`、`url`、运行时前缀和 Vite base 完全一致。
- [ ] Vite base 末尾带 `/`。
- [ ] 正式入口未配置 TCP port。
- [ ] 正式启动不绑定 `0.0.0.0`。
- [ ] 全部正式构建脚本注入同一个 base。
- [ ] 前端内部请求不再直接依赖 NAS 根路径。

### 7.2 启动检查

- [ ] 安装后可以创建 Socket。
- [ ] Socket 所有者、用户组和权限符合预期。
- [ ] 网关可以连接 Socket。
- [ ] 重启应用不会出现 `EADDRINUSE`。
- [ ] 停止应用后 PID 和 Socket 被清理。
- [ ] 后端日志包含监听方式和路径，但不泄漏敏感配置。

### 7.3 功能回归

- [ ] 桌面图标能够打开应用。
- [ ] 首页和静态资源无 404。
- [ ] 登录、退出和刷新后会话恢复正常。
- [ ] 文件列表、打开、保存、重命名、复制、移动和删除正常。
- [ ] 图片上传、图片管理和图床功能正常。
- [ ] Markdown、Mermaid、公式和代码高亮正常。
- [ ] PDF 预览及 worker 加载正常。
- [ ] Office 预览、编辑、保存和新窗口打开正常。
- [ ] AI 对话和图片生成代理正常。
- [ ] 手机端和桌面端 iframe 均可使用。

### 7.4 网络验收

- [ ] 应用不再监听 NAS 局域网 TCP 端口。
- [ ] 所有应用请求均位于 `/app/<应用标识>/` 下。
- [ ] 不存在意外请求 `/api/*`、`/assets/*`、`/wasm/*` 等 NAS 根路径。
- [ ] API 404 返回 JSON，静态资源 404 不返回错误的 HTML。

## 8. 发布与回滚

### 8.1 推荐发布方式

1. 在独立迁移分支完成改造。
2. 生成带独立版本号的测试 FPK。
3. 在测试 fnOS 环境安装，不直接覆盖生产数据。
4. 完成全量验收清单。
5. 备份现有 FPK、配置和应用数据。
6. 再执行生产升级。

### 8.2 回滚条件

出现以下任一情况应回滚：

- 网关无法连接 Socket。
- 登录或核心文件读写不可用。
- Office Editor 无法打开或保存。
- 大量静态资源或 API 返回 404。
- 升级后应用无法稳定重启。

### 8.3 回滚方法

迁移期应保留旧 CGI 文件及旧版本 FPK。回滚时：

1. 停止统一网关版本应用。
2. 清理遗留 Socket。
3. 恢复旧版本 FPK 和 CGI 入口配置。
4. 确认固定端口服务恢复。
5. 验证用户数据和数据库未受影响。

## 9. 推荐提交拆分

为降低评审和回滚风险，建议按以下顺序提交：

1. 增加统一路径工具和测试，不切换入口。
2. 后端增加 Unix Socket 与路径前缀兼容，保留 TCP 回退。
3. 前端迁移 API 和静态资源 URL。
4. 构建脚本注入网关 base。
5. 切换 `app/ui/config` 和 `cmd/main` 到统一网关。
6. fnOS 实机修正与专项回归。
7. 删除 CGI、端口向导和旧兼容逻辑。

## 10. 实施前待确认事项

- [ ] 最终网关标识使用 `App.Native.MdEditor2` 还是 `mdeditor2`。
- [ ] Socket 文件应位于 `TRIM_APPDEST`、`TRIM_PKGVAR` 还是平台指定目录。
- [ ] 飞牛网关连接 Socket 使用的用户和用户组。
- [ ] 网关是否将完整 `gatewayPrefix` 转发给后端。
- [ ] `iframe` 类型在统一网关下的推荐配置。
- [ ] `manifest.service_port` 在统一网关模式下是否应删除。
- [ ] `disable_authorization_path` 对统一网关入口的影响。
- [ ] 目标 fnOS 最低版本要求是否需要上调。

上述事项确认后，才能将本文档中的示例值固化为生产配置。
