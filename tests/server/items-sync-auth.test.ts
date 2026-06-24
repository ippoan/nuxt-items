import { describe, it, expect } from 'vitest'
import { decideSyncAuth } from '../../worker/auth-decision'

const ORG = 'org-prod-1111'

describe('decideSyncAuth — items-sync WS ハンドシェイク認可', () => {
  it('accept (101): active かつ tenant_id === orgId → sub を userId に', () => {
    const d = decideSyncAuth(
      { active: true, tenant_id: ORG, sub: 'github:alice', email: 'a@b.com' },
      ORG,
    )
    expect(d.status).toBe(101)
    expect(d.userId).toBe('github:alice')
  })

  it('accept (101): sub 欠落時は email に fallback (#294 反映前の prod 互換)', () => {
    const d = decideSyncAuth({ active: true, tenant_id: ORG, email: 'a@b.com' }, ORG)
    expect(d.status).toBe(101)
    expect(d.userId).toBe('a@b.com')
  })

  it('reject (401): active:false (署名不正 / 失効 / アプリ不許可)', () => {
    const d = decideSyncAuth({ active: false }, ORG)
    expect(d.status).toBe(401)
    expect(d.userId).toBe('')
  })

  it('reject (401): null / undefined 結果 (introspect 失敗 fail-closed)', () => {
    expect(decideSyncAuth(null, ORG).status).toBe(401)
    expect(decideSyncAuth(undefined, ORG).status).toBe(401)
  })

  it('reject (403): cross-tenant — 有効な別 org の token で接続', () => {
    const d = decideSyncAuth(
      { active: true, tenant_id: 'org-other-2222', sub: 'github:mallory' },
      ORG,
    )
    expect(d.status).toBe(403)
    expect(d.userId).toBe('')
  })

  it('reject (403): tenant_id 欠落', () => {
    const d = decideSyncAuth({ active: true, sub: 'x' }, ORG)
    expect(d.status).toBe(403)
  })

  it('reject (403): 接続先 orgId が空 (path 解析失敗)', () => {
    const d = decideSyncAuth({ active: true, tenant_id: ORG }, '')
    expect(d.status).toBe(403)
  })

  it('accept 時に userId が空でも 101 (sub/email 共に無い極端ケース)', () => {
    const d = decideSyncAuth({ active: true, tenant_id: ORG }, ORG)
    expect(d.status).toBe(101)
    expect(d.userId).toBe('')
  })
})
