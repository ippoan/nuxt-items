import { defineConfig } from 'vitest/config'

// DO worker は親 (nuxt-items) の vitest.config.ts に walk-up で吸われると
// include が `tests/**` を指して test が拾われないため、ローカル config を持つ。
// auth-decision.ts は pure (cloudflare 非依存) なので素の node 環境でテストできる。
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // cross-tenant 認可の pure ロジックだけ 100% gate (app 時代の
      // worker/auth-decision.ts 100% 登録を DO worker へ移植、Refs #290)。
      // items-sync-do.ts / index.ts は cloudflare:workers / DurableObject /
      // WebSocket runtime 依存で node vitest からは計測不可 (要
      // @cloudflare/vitest-pool-workers) のため対象外。
      include: ['src/auth-decision.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
