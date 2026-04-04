export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@vite-pwa/nuxt', '@nuxt/ui', '@vueuse/nuxt'],

  devServer: {
    host: '0.0.0.0',
  },

  nitro: {
    preset: 'cloudflare-module',
    prerender: {
      autoSubfolderIndex: false,
    },
  },

  runtimeConfig: {
    public: {
      authWorkerUrl: process.env.NUXT_PUBLIC_AUTH_WORKER_URL || '',
      syncUrl: process.env.NUXT_PUBLIC_SYNC_URL || '',
    },
  },

  build: {
    transpile: [
      '@ippoan/auth-client',
    ],
  },

  vite: {
    server: {
      hmr: {
        protocol: 'wss',
        clientPort: 443,
      },
    },
  },

  hooks: {
    'vite:extendConfig'(viteInlineConfig: any) {
      viteInlineConfig.server = {
        ...viteInlineConfig.server,
        hmr: {
          clientPort: 443,
          protocol: 'wss',
          path: 'hmr/',
        },
      }
    },
  },

  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
        { name: 'theme-color', content: '#4A90D9' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
    },
  },

  pwa: {
    client: { installPrompt: true },
    registerType: 'autoUpdate',
    manifest: {
      name: '物品管理',
      description: '組織・個人の物品管理',
      theme_color: '#4A90D9',
      lang: 'ja',
      short_name: '物品管理',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      share_target: {
        action: '/',
        method: 'GET',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
        },
      },
    },
    workbox: {
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,ico,png,svg}'],
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
})
