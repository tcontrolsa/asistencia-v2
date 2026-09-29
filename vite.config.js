import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        supervisor: resolve(__dirname, 'supervisor.html'),
        guardia: resolve(__dirname, 'guardia.html'),
        catering: resolve(__dirname, 'catering.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://192.168.10.129:3000',
        changeOrigin: true,
      },
    },
  },
})
