/**
 * REST API プロキシ
 * /api/proxy/* → auth-worker /alc-proxy/* → rust-alc-api の /api/*
 *
 * #434 step 3 (方式 B): introspect / ACL / OIDC mint / identity 注入を
 * auth-worker `/alc-proxy/*` に集約し、consumer は createAuthWorkerProxyHandler で
 * service binding (AUTH_WORKER) に thin-forward するだけ。旧 createIdentityProxyHandler
 * (方式 A) を置換。consumer は X-Alc-Proxy-Secret (=INTERNAL_SHARED_SECRET、consumer
 * proof) + X-Alc-Proxy-Origin + browser JWT のみ。token は cookie (logi_auth_token)
 * / Authorization Bearer のどちらでも拾う。auth-worker (#308) が X-Alc-Proxy-Secret を
 * constant-time 検証してから JWT 検証 + ACL + OIDC mint + X-Tenant-ID/X-User-* 注入を
 * 行う。AUTH_WORKER は方式 B で必須 (未設定は 503)。
 */
import type { H3Event } from 'h3'
import { createAuthWorkerProxyHandler } from '@ippoan/auth-client/server'

function cfEnv(event: H3Event): Record<string, unknown> {
  return (event.context.cloudflare as { env?: Record<string, unknown> } | undefined)?.env ?? {}
}

/** Secrets Store binding (`.get()`) / 文字列 のいずれでも値を取り出す。 */
async function resolveSecret(binding: unknown): Promise<string | null> {
  if (typeof binding === 'string') return binding
  if (binding && typeof (binding as { get?: unknown }).get === 'function') {
    return (await (binding as { get(): Promise<string> }).get()) ?? null
  }
  return null
}

export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const sharedSecret = await resolveSecret(env.INTERNAL_SHARED_SECRET)
  if (!sharedSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'INTERNAL_SHARED_SECRET binding が未設定です',
    })
  }
  const authWorker = env.AUTH_WORKER as { fetch: typeof fetch } | undefined
  if (!authWorker) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AUTH_WORKER service binding が未設定です',
    })
  }

  const proxy = createAuthWorkerProxyHandler({
    sharedSecret,
    authWorkerFetch: () => authWorker.fetch.bind(authWorker),
    // utils/api.ts の path が既に /api/... を含むため pathPrefix='/' (二重 /api 防止)。
    pathPrefix: '/',
  })
  return proxy(event)
})
