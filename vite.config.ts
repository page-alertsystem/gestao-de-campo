import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Duas entradas separadas:
//   /          -> GIO completo (computador)
//   /mobile/   -> GIO Mobile (celular / aplicativo Android)
export default defineConfig({
  base: process.env.GIO_PAGES_BUILD === 'true' ? '/gestao-de-campo/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile/index.html', import.meta.url)),
      },
    },
  },
})
