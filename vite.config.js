import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// IMPORTANT: base must match the GitHub Pages repo name exactly.
// Live URL: https://eat-ambria.github.io/Ambria---Workforce/
export default defineConfig({
  base: '/Ambria---Workforce/',
  build: {
    rollupOptions: {
      // Two HTML entries, because two installable apps need two manifests in
      // two heads. fix-request/index.html is emitted at dist/fix-request/, which
      // GitHub Pages serves at /Ambria---Workforce/fix-request/ — a real file,
      // not the SPA 404 fallback, so the public manifest arrives with the page.
      input: {
        main: 'index.html',
        fixRequest: 'fix-request/index.html',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // stated rather than inferred from start_url: the public repair page
        // ships its own manifest at this origin, and the two must never be
        // mistaken for one app
        id: '/Ambria---Workforce/',
        name: 'Ambria Admin',
        short_name: 'Ambria Admin',
        description: 'Ambria Admin — task, training and team management for Ambria event venues',
        theme_color: '#7B1E2F',
        background_color: '#F5F6F8',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/Ambria---Workforce/',
        start_url: '/Ambria---Workforce/',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // separate maskable art: Android crops ~10% off every edge to fit its
          // squircle, so the wordmark is inset further in this one
          { src: 'icons/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // take over from the previous worker straight away instead of waiting
        // for every tab to close, and bin the old build's caches
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // pull our Web Push handlers into the generated service worker
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Cache Supabase Storage photos for offline viewing
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-photos',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),

    // vite-plugin-pwa injects the ADMIN manifest into every HTML entry it sees.
    // On the public page that lands above ours and wins, which is the whole bug
    // this entry exists to fix — so it is stripped back out, from that page only.
    {
      name: 'one-manifest-per-page',
      enforce: 'post',
      // Not transformIndexHtml: vite-plugin-pwa adds its link after that hook
      // has run, so stripping there removed nothing. The emitted asset is the
      // last place both links exist, and this plugin is registered last.
      generateBundle(_options, bundle) {
        for (const [name, asset] of Object.entries(bundle)) {
          if (!name.includes('fix-request') || !name.endsWith('.html')) continue
          const before = asset.source
          asset.source = String(before).replace(
            /<link[^>]+rel="manifest"[^>]+\/manifest\.webmanifest"[^>]*>\s*/g,
            ''
          )
          if (asset.source === before) {
            this.warn(`one-manifest-per-page: nothing removed from ${name}`)
          }
        }
      },
    },
  ],
})
