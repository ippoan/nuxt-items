import { defineConfig } from 'vitest/config'

// DO worker は親 (nuxt-items) の vitest.config.ts に walk-up で吸われると
// include が `tests/**` を指して test が拾われないため、ローカル config を持つ。
// auth-decision.ts は pure (cloudflare 非依存) なので素の node 環境でテストできる。
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
