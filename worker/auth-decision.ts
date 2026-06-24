/**
 * items-sync WebSocket ハンドシェイクの認可判定 (純粋関数 / cloudflare 非依存)。
 *
 * cf-grpc-proxy の ItemsSyncDO は共有 HS256 `JWT_SECRET` で token を自前検証して
 * いたが、(1) `JWT_SECRET` の各 consumer 配布をやめる #290 の方針に反する、
 * (2) token の tenant (`org`) と接続先 orgId の一致を検証しておらず、有効な別
 * テナントの JWT で他組織の sync DO に相乗りできる cross-tenant 穴があった。
 *
 * 本関数は auth-worker `POST /auth/introspect` の正規化済み結果と、URL path から
 * 取り出した接続先 orgId を突き合わせ、ハンドシェイクの HTTP status と確定した
 * userId を返す。cloudflare:workers / fetch に依存しないので plain Vitest で
 * テストできる (= ItemsSyncDO 本体を bundle せずに認可ロジックを固められる)。
 */

/** auth-worker `/auth/introspect` 応答の必要 field (#294 で `sub` 追加)。 */
export interface IntrospectResult {
  active: boolean
  tenant_id?: string
  sub?: string
  email?: string
}

/** ハンドシェイク判定結果。`status === 101` の時だけ accept する。 */
export interface SyncAuthDecision {
  /** 101 = accept / 401 = token invalid / 403 = tenant mismatch */
  status: 101 | 401 | 403
  /** broadcast の personal 絞り込みに使う verified user 識別子 (accept 時のみ非空)。 */
  userId: string
}

/**
 * introspect 結果 × 接続先 orgId から WS ハンドシェイクの可否を決める。
 *
 * - `active` でない (署名不正 / 失効 / env 不一致 / アプリ不許可) → 401
 * - tenant_id が接続先 orgId と不一致 → 403 (cross-tenant 拒否、明示)
 * - 一致 → 101 + userId (= introspect の `sub`、無ければ `email` に fallback)
 *
 * `sub` fallback to `email`: auth-worker prod が #294 (`sub` 返却) 反映前でも
 * personal 絞り込みが degrade せず動くようにするため。
 */
export function decideSyncAuth(
  result: IntrospectResult | null | undefined,
  orgId: string,
): SyncAuthDecision {
  if (!result || result.active !== true) {
    return { status: 401, userId: '' }
  }
  if (!orgId || !result.tenant_id || result.tenant_id !== orgId) {
    return { status: 403, userId: '' }
  }
  return { status: 101, userId: result.sub || result.email || '' }
}
