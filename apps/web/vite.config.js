import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'clipvoice',
        short_name: 'clipvoice',
        description: 'Watch YouTube videos with live translated subtitles.',
        start_url: '/',
        display: 'standalone',
        background_color: '#efe9f6',
        theme_color: '#efe9f6',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        // Share a link from the YouTube app straight into clipvoice (Android, desktop Chrome).
        share_target: { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com', handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 20 } } },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
