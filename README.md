# App.Native.MdEditor - 飞牛 NAS Markdown 编辑器

为飞牛 fnOS 设计的 Markdown 编辑器，支持实时预览、图表/公式渲染、图床管理、AI 辅助与多格式导出。

## 项目状态

- 当前版本：`v1.30.0`
- 发布日期：`2026-04-04`
- 开发阶段：稳定版本（桌面端/移动端可用）

## 核心能力

- 编辑体验：Monaco 编辑器、语法高亮、代码折叠、自动保存、编辑/预览联动
- Markdown 扩展：GFM、任务列表、脚注、Mermaid、KaTeX
- 文件与导出：打开/保存/另存为、文件树与收藏夹、HTML/TXT/微信公众号导出
- AI 能力：AI 对话、文生图、AI 主题生成与导出样式辅助
- 一键多平台发布：微信公众号、HTML、PDF、图片等格式导出与发布流程
- 图片能力：粘贴/拖拽上传、图片管理、HEIC 转换、图注与缩放
- 图床能力：支持多类型图床（含 本地、阿里云OSS、腾讯云OSS、github、七牛云、MinIO、WebDAV、自定义 OSS）


<details>
<summary><strong>点击查看编辑器预览图</strong></summary>
<img src="https://pic1.imgdb.cn/item/69c65e5bebec5f1015549e1f.png" alt="飞牛NAS编辑器预览">
<p align="center"><sub>飞牛NAS编辑器预览</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92d6f3833931b653e7493.png" alt="桌面端暗黑模式预览">
<p align="center"><sub>桌面端暗黑模式预览</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c7d8724066a6014cf59e36.png" alt="多平台发布"><br>
<p align="center"><sub>多平台发布</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92a923833931b653e73a0.png" alt="多图床支持"><br>
<p align="center"><sub>多图床支持</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92afa3833931b653e73a7.png" alt="AI会话"><br>
<p align="center"><sub>AI会话</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92b1c3833931b653e73ae.png" alt="AI文生图"><br>
<p align="center"><sub>AI文生图</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92b453833931b653e73ba.png" alt="AI内置服务与服务商配置"><br>
<p align="center"><sub>AI内置服务与服务商配置</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92bb33833931b653e73d2.png" alt="主题与导出配置"><br>
<p align="center"><sub>主题与导出配置</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92c303833931b653e73e6.png" alt="文件夹挂载方式"><br>
<p align="center"><sub>文件夹挂载方式</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92c803833931b653e7425.png" alt="文件自动备份"><br>
<p align="center"><sub>文件自动备份</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92e793833931b653e74e6.png" alt="Excel表格转换预览（试验性）">
<p align="center"><sub>Excel表格转换预览（试验性）</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92ebf3833931b653e74f8.png" alt="PDF文件预览"><br>
<p align="center"><sub>PDF文件预览</sub></p><br>
<img src="https://pic1.imgdb.cn/item/69c92eef3833931b653e7501.png" alt="Word文档转换预览（试验性）"><br>
<p align="center"><sub>Word文档转换预览（试验性）</sub></p><br>
<div align="center">
<table>
  <tr>
    <td align="center" valign="top">
      <img src="https://pic1.imgdb.cn/item/69c92cfa3833931b653e745f.png" alt="移动端编辑区预览" width="200"><br>
      <sub>移动端编辑区预览</sub>
    </td>
    <td align="center" valign="top">
      <img src="https://pic1.imgdb.cn/item/69c9a93e3833931b653eea12.png" alt="移动端明亮模式预览" width="200"><br>
      <sub>移动端明亮模式预览</sub>
    </td>
    <td align="center" valign="top">
      <img src="https://pic1.imgdb.cn/item/69c92d353833931b653e7485.png" alt="移动端暗黑模式预览" width="200"><br>
      <sub>移动端暗黑模式预览</sub>
    </td>
  </tr>
</table>
</div>

</details>

## 最近更新

完整条目见 [CHANGELOG.md](./CHANGELOG.md)（开发日志）。

### v1.30.0 (2026-04-04)

- 修复 AI 对话在“翻译成英文 + 引用全文”场景下，回复完成后被主题 CSS 规范化逻辑误覆盖的问题
- 主题 CSS 后处理改为仅在“帮我写主题”意图触发，避免普通翻译/改写任务误命中
- 优化 AI 对话后处理稳定性，提升输出结果可预期性

### v1.29.63 (2026-04-04)

- 新增登录鉴权流程（Auth Bootstrap + 登录页），未登录用户先鉴权后进入编辑器
- 修复“启动时显示过渡页”关闭后刷新仍短暂闪现的问题
- 修复鉴权加载层与首屏过渡页叠加显示（黑色“正在加载”与过渡页同时出现）
- 优化过渡页启动时序与停留时长，确保主要动画完整展示后退出

### v1.29.62 (2026-03-31)

- 新增同源访问入口 `proxy.cgi`，改善桌面 iframe 场景下的跨域/鉴权与主题适配
- 修复 `proxy.cgi` 路径下静态资源 404、改端口后代理 500、「新窗口」端口错误等问题
- 主题可随飞牛系统主题切换；关于页版本与 `manifest` 构建注入一致；打包脚本补齐 `proxy.cgi` 等入包

### v1.29.61 (2026-03-30)

- 新增 WebDAV 与自定义 OSS 图床接入入口
- 修复 MinIO 上传目录输入体验问题（光标跳动、自动插入斜杠）
- 补充 MinIO 存储桶访问策略说明（公共读 / 预签名 URL）

### v1.29.53 (2026-03-30)

- 修正 `manifest` 描述格式，避免 `fnpack` 解析异常

## 安装与使用

### 飞牛 NAS 安装

1. 下载 `App.Native.MdEditor2.fpk`
2. 在飞牛 NAS 应用中心上传安装
3. 启动应用并访问

### 快速开始

1. 新建或打开 Markdown 文件
2. 在编辑区输入内容，右侧实时预览
3. 使用 `Ctrl/Cmd + S` 保存
4. 通过导出菜单输出目标格式

## 开发与构建

### 环境要求

- Node.js 22+
- npm
- fnOS 开发环境（或 Docker）

### 前端开发

```bash
export PATH=/var/apps/nodejs_v22/target/bin:$PATH
cd app/ui/frontend
npm install
npm run dev
```

### 构建打包

```bash
cd app/ui/frontend
npm run build

cd <项目根目录>
fnpack build
```

### 多架构打包（amd64/arm64）

使用根目录脚本 `build-fpk-multi-arch.sh` 可分别构建不同架构的 FPK 包：

```bash
# 交互模式（选择目标架构）
bash build-fpk-multi-arch.sh

# 指定架构构建
bash build-fpk-multi-arch.sh amd64
bash build-fpk-multi-arch.sh arm64

# 同时构建两个架构
bash build-fpk-multi-arch.sh amd64 arm64
```

产物会按架构命名，例如：`App.Native.MdEditor2-<version>-amd64.fpk`、`App.Native.MdEditor2-<version>-arm64.fpk`。

### Docker（可选）

```bash
docker build -t mdeditor2:latest .
docker run -d --rm --name mdeditor2 -p 18080:18080 \
  -v $(pwd)/data:/app/data \
  mdeditor2:latest
```

访问地址：`http://localhost:18080/`

## 常用快捷键

- `Ctrl/Cmd + S`：保存
- `Ctrl/Cmd + Shift + S`：另存为
- `Ctrl/Cmd + O`：打开文件
- `Ctrl/Cmd + B`：加粗
- `Ctrl/Cmd + I`：斜体
- `Ctrl/Cmd + K`：插入链接

## 文档

- [CHANGELOG.md](./CHANGELOG.md) - 版本更新历史
- [app/ui/frontend/README.md](./app/ui/frontend/README.md) - 前端、后端 API 与开发/排障说明
- [manifest](./manifest) - 应用元信息（版本、端口、依赖）

## 反馈与贡献

欢迎提交 Pull Request 和 Issue。

提交问题时建议附带：版本号、运行环境、错误信息、复现步骤。

鸣谢 <a href="https://doocs.org/" target="_blank">Doocs</a> 开发者友好的开源社区，开源项目支持 <a href="https://github.com/doocs/cose" target="_blank">cose</a>
## 许可证

MIT License

---

最后更新：`2026-04-04`（v1.30.0）  
维护者：听闻  
项目地址：[GitHub](https://github.com/sangxuesheng/App.Native.MdEditor)
