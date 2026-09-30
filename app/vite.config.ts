import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Solo variables VITE_* llegan al bundle; ningún secreto va aquí (§5.5).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,               // se registra en src/pwa.ts (mismo flujo que el legado)
        includeAssets: ['assets/icons/*.png', 'assets/images/*.png', 'offline.html'],
        manifest: {
          name: 'TCONTROL Asistencia',
          short_name: 'TCONTROL',
          description: 'Sistema de control de asistencia TCONTROL S.A.',
          start_url: 'index.html',
          display: 'standalone',
          background_color: '#0f172a',
          theme_color: '#dc2626',
          orientation: 'portrait-primary',
          lang: 'es',
          categories: ['business', 'productivity'],
          icons: [
            { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          shortcuts: [{
            name: 'Registrar Entrada', short_name: 'Entrada', description: 'Registra tu entrada rápidamente',
            url: 'index.html#entrada', icons: [{ src: 'assets/icons/icon-192.png', sizes: '192x192' }],
          }],
          prefer_related_applications: false,
        },
        workbox: {
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/rest\//, /\/rpc\//],
          globPatterns: ['**/*.{js,css,html,png,woff2}'],
          // Librerías de exportación cargadas bajo demanda en el panel de supervisor: fuera del precache
          globIgnores: ['**/assets/xlsx-*.js', '**/assets/html2pdf-*.js', '**/assets/html2canvas*.js', '**/assets/jspdf*.js', '**/assets/purify*.js', '**/assets/index.es-*.js'],
          runtimeCaching: [],               // la API nunca se cachea: la hora y el estado vienen del servidor
        },
      }),
    ],
    // Una página por actor, como el legado (index, guardia, catering) + kiosco (D-23)
    build: {
      rollupOptions: {
        input: {
          index: 'index.html',
          guardia: 'guardia.html',
          catering: 'catering.html',
          kiosco: 'kiosco.html',
          supervisor: 'supervisor.html',
        },
      },
    },
    server: {
      host: true,
      port: 5180,
      proxy: {
        '/rest': {
          target: env.PGRST_PROXY_TARGET || 'http://192.168.10.129:3001',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/rest/, ''),
        },
      },
    },
  };
});
