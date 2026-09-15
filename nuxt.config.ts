export default defineNuxtConfig({
  // auth-client の SSR 認証状態 (opt-in、Refs ippoan/auth-worker#560)。
  // server が cookie から認証の判定 (expiresAt / orgId / username) を決めて useState に載せる。
  // payload に生 JWT は載らない。戻すときはこの 1 行を消す。
  ippoanAuthClient: { authState: true },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  // chunk load 失敗 (immutable キャッシュされた `/_nuxt/*.js` の 404) からの自動復旧。
  // `experimental.emitRouteChunkError = 'manual'` と transpile 登録も module 側が行う
  // ので consumer は 1 行で済む (Refs ippoan/auth-worker#452)。
  modules: ['@vite-pwa/nuxt', '@nuxt/ui', '@vueuse/nuxt', '@ippoan/auth-client/module'],

  devServer: {
    host: '0.0.0.0',
  },

  nitro: {
    preset: 'cloudflare-module',
    prerender: {
      autoSubfolderIndex: false,
    },
  },

  typescript: {
    tsConfig: {
      // worker/index.ts は build 成果物 (../.output) に依存し nuxi typecheck では
      // 解決できないため除外。DO 本体 (ItemsSyncDO) は別 worker nuxt-items-sync
      // (workers/items-sync) に分離済みで、@cloudflare/workers-types を持つ
      // そちらの tsconfig が型を担保する。app の vue-tsc は workers/ を見ない。
      exclude: ['../worker/index.ts', '../workers'],
    },
  },

  runtimeConfig: {
    // server-only: /api/proxy/* server route が introspect 検証後に転送する
    // rust-alc-api 直 URL (#434 step 2)。public に置かない (browser に露出させない)。
    alcApiUrl: process.env.NUXT_ALC_API_URL || '',
    public: {
      authWorkerUrl: process.env.NUXT_PUBLIC_AUTH_WORKER_URL || '',
      syncUrl: process.env.NUXT_PUBLIC_SYNC_URL || '',
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || '',
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
