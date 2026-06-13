/**
 * rust-alc-api `/api/items` 統合テスト (live のみ)。
 *
 * frontend-ci の API Integration job が docker-compose.test.yml で rust-alc-api
 * コンテナを立て、`API_BASE_URL=http://localhost:18080` で実行する。green なら
 * 「nuxt-items は rust-alc-api:<sha> と互換」という Release Wave compatibility
 * edge が記録され、ci-dashboard の Compatibility グラフに nuxt-items が出る。
 *
 * 認証は require_tenant の X-Tenant-ID フォールバックを使う (JWT 署名不要)。
 * tenant は tests/fixtures/seed.sql で投入した固定 UUID。
 *
 * mock / ローカル (`npm test`、API_BASE_URL 未設定) では describe.skipIf で skip。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { isLive, API_BASE, waitForApi } from '../helpers/api-test-env'

const TENANT = '11111111-1111-1111-1111-111111111111'
const SEED_ITEM = 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa'

interface ApiResult {
  status: number
  body: unknown
}

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  const res = await fetch(new URL(path, API_BASE).toString(), {
    ...init,
    headers: {
      'X-Tenant-ID': TENANT,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('json') ? await res.json() : await res.text()
  return { status: res.status, body }
}

describe.skipIf(!isLive)('rust-alc-api /api/items integration (live)', () => {
  beforeAll(async () => {
    await waitForApi()
  })

  it('GET /api/items は tenant スコープで seed item を返す', async () => {
    const { status, body } = await api('/api/items?owner_type=org')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    const items = body as Array<{ id: string; name: string }>
    expect(items.some((i) => i.id === SEED_ITEM)).toBe(true)
  })

  it('POST → GET/{id} → DELETE の CRUD が通る', async () => {
    const create = await api('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        name: 'integration-created',
        owner_type: 'org',
        item_type: 'item',
      }),
    })
    expect(create.status).toBe(201)
    const created = create.body as { id: string; name: string; owner_type: string }
    expect(created.name).toBe('integration-created')
    expect(created.owner_type).toBe('org')

    const got = await api(`/api/items/${created.id}`)
    expect(got.status).toBe(200)
    expect((got.body as { id: string }).id).toBe(created.id)

    const del = await api(`/api/items/${created.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    const after = await api(`/api/items/${created.id}`)
    expect(after.status).toBe(404)
  })

  it('tenant ヘッダ無しは拒否される (require_tenant)', async () => {
    const res = await fetch(new URL('/api/items', API_BASE).toString())
    expect([400, 401]).toContain(res.status)
  })
})
