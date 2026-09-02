import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GIO_PAGES_BUILD === 'true' ? '/gestao-de-campo/' : '/',
  plugins: [react()],
})
