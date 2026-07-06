import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // import.meta.dirname = ESM แท้ (__dirname ไม่มีใน ESM — vite 8 โหลด config เป็น ESM ตรง)
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
