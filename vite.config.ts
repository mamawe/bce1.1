import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 离线演示站：构建完全独立，不依赖 ../frontend。
// base: './' 让产物用相对路径引资源——放在 GitHub Pages 的项目子路径、
// 对象存储的子目录、或本地任意目录下都能直接打开。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5175,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 单页应用，数据全内嵌，体积接近 1MB 属正常，不用报警
    chunkSizeWarningLimit: 1400,
  },
})
