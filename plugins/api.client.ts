/**
 * Items REST API 初期化プラグイン
 *
 * auth plugin の後に実行。
 * useAuth() から JWT トークンを取得して API クライアントに渡す。
 */
import { initItemsApi } from '~/utils/api'

export default defineNuxtPlugin(() => {
  const { token } = useAuth()
  const config = useRuntimeConfig()

  // API ベース URL: 環境変数または同一オリジン
  const apiBase = (config.public.apiBaseUrl as string) || ''

  initItemsApi(apiBase, () => token.value || null)
})
