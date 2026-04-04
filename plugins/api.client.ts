import { initItemsApi } from '~/utils/api'

export default defineNuxtPlugin(() => {
  const { token } = useAuth()
  const config = useRuntimeConfig()
  const apiBase = (config.public.apiBaseUrl as string) || ''
  initItemsApi(apiBase, () => token.value || null)
})
