import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget =
    env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-charts': ['recharts'],
            'vendor-xlsx': ['xlsx'],
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'vendor-appwrite': ['appwrite'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB — bundle atual é ~2.1 MB
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/assets\//],
          // Não precachear JS/CSS hashed — evita servir chunks de deploys antigos via SW.
          globPatterns: ['**/*.{html,ico,png,svg,webp,webmanifest,woff2,woff,ttf}'],
          globIgnores: ['**/assets/**'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'assets',
                networkTimeoutSeconds: 8,
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            }
          ]
        },
        includeAssets: [
          'favicon-16x16.png',
          'favicon-32x32.png',
          'apple-touch-icon.png',
          'navi-app-icon.png',
          'navi-icon-on-dark.png',
          'navi-icon-on-light.png',
          'navi-logo-on-dark.png',
          'navi-logo-on-light.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
        ],
        manifest: {
          name: 'Nave',
          short_name: 'Nave',
          description: 'CRM para estúdios de luta, dança, yoga e atividades físicas',
          theme_color: '#13111F',
          background_color: '#13111F',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('error', (err, _req, res) => {
              console.error('[vite] /api proxy error:', err?.message || err);
              if (!res || res.headersSent) return;
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  sucesso: false,
                  erro: 'api_proxy_unavailable',
                })
              );
            });
          },
        },
        // Roteia chamadas ao equipamento Control iD via servidor local (porta 4000).
        // Necessário para evitar CORS — o browser não consegue chamar IPs de rede local diretamente.
        '/controlid-proxy': {
          target: 'http://localhost:4000',
          changeOrigin: true
        }
      }
    }
  }
})
