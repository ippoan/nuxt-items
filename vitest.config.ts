import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'composables/**/*.ts',
        'server/**/*.ts',
        // worker/ のうち pure な認可判定だけ instrument する。DO 本体
        // (items-sync-do.ts) / entry (index.ts) は cloudflare:workers /
        // build 成果物に依存し vitest で import できないため対象外。
        'worker/auth-decision.ts',
      ],
      exclude: [
        'composables/useAuth.ts',
      ],
    },
  },
})
