import { initItemsApi } from '~/utils/api'

export default defineNuxtPlugin(() => {
  const { token } = useAuth()
  // #434 step 2: rust-alc-api 直叩き (config.public.apiBaseUrl) をやめ、
  // 同一オリジンの server route /api/proxy/* 経由にする。proxy が cookie /
  // Bearer を introspect 検証して X-Tenant-ID + X-User-* を backend に注入する
  // (client 側の手動 tenant 付与は不要。Authorization Bearer は proxy が拾う)。
  // utils/api.ts の path は `/api/...` なので base="/api/proxy" で
  // /api/proxy/api/items に転送される。
  initItemsApi('/api/proxy', () => token.value || null)
})
