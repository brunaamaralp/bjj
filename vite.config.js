import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget =
    env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['vite.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'FitGrow',
          short_name: 'FitGrow',
          description: 'CRM simples para academias de esportes',
          theme_color: '#0b0b0b',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'pwa-512-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
