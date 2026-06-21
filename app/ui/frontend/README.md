# Markdown 编辑器 - 前端项目

基于 React + Vite + Monaco Editor 构建的现代化 Markdown 编辑器。

## 功能特性

- ✅ Monaco Editor 代码编辑器
- ✅ 实时 Markdown 预览
- ✅ GFM（GitHub Flavored Markdown）支持
- ✅ 任务列表、表格、脚注
- ✅ LaTeX 数学公式渲染
- ✅ Mermaid 流程图支持
- ✅ 多种布局模式（水平/垂直/单栏）
- ✅ 深色/浅色主题切换
- ✅ 快捷键支持
- ✅ 文件读写 API 集成

## 安装依赖

```bash
npm install
```

## 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

## 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

## 快捷键

- `Ctrl/Cmd + S`: 保存文件
- `Ctrl/Cmd + B`: 加粗选中文本
- `Ctrl/Cmd + I`: 斜体选中文本

## 技术栈

- React 18
- Vite 5
- Monaco Editor
- Markdown-it
- Mermaid
- KaTeX

## 项目结构

```
frontend/
├── src/
│   ├── App.jsx          # 主应用组件
│   ├── App.css          # 应用样式
│   ├── main.jsx         # 入口文件
│   └── index.css        # 全局样式
├── public/              # 静态资源
├── index.html           # HTML 模板
├── vite.config.js       # Vite 配置
└── package.json         # 依赖配置
```

## API 接口

### 读取文件
```
GET /api/file?path=/absolute/path/to/file.md
```

### 保存文件
```
POST /api/file
Content-Type: application/json

{
  "path": "/absolute/path/to/file.md",
  "content": "markdown content"
}
```

## 部署说明

构建完成后，将 `dist` 目录的内容部署到后端服务的静态文件目录，或配置后端服务代理前端路由。

