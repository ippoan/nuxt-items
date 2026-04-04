/**
 * API テスト共通環境 (mock / live 両対応)
 *
 * API_BASE_URL 設定時 → 実サーバーに HTTP リクエスト (live)
 * 未設定時 → handler 直接呼び出し + mock globals (mock)
 */
import { vi } from 'vitest'

export const isLive = !!process.env.API_BASE_URL
export const API_BASE = process.env.API_BASE_URL || ''

/**
 * live モード: API_BASE_URL に GET/POST リクエスト
 */
export async function liveGet(path: string, query?: Record<string, string>) {
  const url = new URL(path, API_BASE)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  return {
    status: res.status,
    data: res.headers.get('content-type')?.includes('json')
      ? await res.json()
      : await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
    redirected: res.redirected,
    url: res.url,
  }
}

export async function livePost(path: string, body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(new URL(path, API_BASE).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return {
    status: res.status,
    data: res.headers.get('content-type')?.includes('json')
      ? await res.json()
      : await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  }
}

/**
 * mock 専用アサーション。live 時は何もしない。
 */
export function assertMock(fn: () => void) {
  if (!isLive) fn()
}

/**
 * live 専用アサーション。mock 時は何もしない。
 */
export function assertLive(fn: () => void) {
  if (isLive) fn()
}

/**
 * live モード用: API ヘルスチェック待ち
 */
export async function waitForApi(maxRetries = 30): Promise<void> {
  if (!isLive) return
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`API not ready after ${maxRetries} retries`)
}

/**
 * mock モード用: h3/nitro auto-import のグローバル stub 一括セットアップ
 */
export function stubNitroGlobals(overrides: Record<string, unknown> = {}) {
  if (isLive) return {}

  const mocks: Record<string, ReturnType<typeof vi.fn>> = {}

  const defaults: Record<string, unknown> = {
    defineEventHandler: (handler: Function) => handler,
    getQuery: vi.fn(),
    getRouterParam: vi.fn(),
    createError: vi.fn((opts: any) => {
      const err: any = new Error(opts.message)
      err.statusCode = opts.statusCode
      return err
    }),
    getRequestURL: vi.fn(),
    getCookie: vi.fn(),
    setCookie: vi.fn(),
    sendRedirect: vi.fn(),
    useRuntimeConfig: vi.fn(),
    getHeader: vi.fn(),
    setHeader: vi.fn(),
    readRawBody: vi.fn(),
  }

  for (const [key, val] of Object.entries({ ...defaults, ...overrides })) {
    vi.stubGlobal(key, val)
    if (typeof val === 'function' && 'mockClear' in val) {
      mocks[key] = val as ReturnType<typeof vi.fn>
    }
  }

  return mocks
}
