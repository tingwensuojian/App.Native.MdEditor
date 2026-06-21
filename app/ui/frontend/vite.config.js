import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  cacheDir: '/tmp/.vite',
  server: {
    // 固定使用 3000；若被占用则直接报错退出，避免误打开到 Cursor 等占用端口导致的模块加载异常。
    port: 3000,
    // 避免端口被 Cursor/其它进程占用后自动换端口，导致用户打开了错误的地址而出现“模块无 default export”等误报。
    strictPort: true,
    host: true, // 局域网可访问，手机等设备可连 NAS_IP:<dev端口> 做热更新调试
    proxy: {
      '/office-editor/': { target: 'http://127.0.0.1:18081', changeOrigin: true, rewrite: (p) => p.replace(/^\/office-editor/, '') },
      '/api/office/editor': {
        target: 'http://127.0.0.1:18083',
        changeOrigin: true
      },
      '/api': {
        target: 'http://127.0.0.1:18080',
        changeOrigin: true
      },
      '/health': {
        target: 'http://127.0.0.1:18008',
        changeOrigin: true
      },
      '/images': {
        target: 'http://127.0.0.1:18008',
        changeOrigin: true
      },
      '/math-svg': {
        target: 'http://127.0.0.1:18008',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2020', // 兼容 Edge
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'monaco-vendor': ['@monaco-editor/react', 'monaco-editor'],
          'markdown-vendor': [
            'unified',
            'remark-parse',
            'remark-math',
            'remark-gfm',
            'remark-breaks',
            'remark-rehype',
            'rehype-katex',
            'rehype-stringify',
            'rehype-raw',
            'rehype-highlight'
          ],
          'math-vendor': ['katex', 'mathjax'],
          // Keep lucide in an eagerly-loaded vendor chunk, but do NOT pull mermaid into it.
          // Mermaid is content-driven and should stay async to avoid slowing down first paint.
          'ui-vendor': ['lucide-react'],
          'mermaid-vendor': ['mermaid']
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false,
    // 压缩优化
    reportCompressedSize: false, // 加快构建速度
    cssMinify: 'esbuild'
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@monaco-editor/react',
      'dayjs',
      'dayjs/plugin/isoWeek.js',
      'dayjs/plugin/customParseFormat.js',
      'dayjs/plugin/advancedFormat.js',
      'unified',
      'remark-parse',
      'remark-math',
      'remark-gfm',
      'remark-rehype',
      'rehype-katex',
      'rehype-stringify',
      'rehype-raw',
      'rehype-highlight',
      // mermaid 依赖的 CJS 包，需预打包以正确解析 named export
      '@braintree/sanitize-url',
      'mermaid'
    ],
    exclude: ['lucide-react']
  }
})
