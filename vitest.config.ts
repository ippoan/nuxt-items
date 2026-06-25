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
        // items-sync DO (auth-decision / DO 本体 / entry) は別 worker
        // nuxt-items-sync に分離済み。そちらの vitest が認可判定を担保する。
      ],
      exclude: [
        'composables/useAuth.ts',
      ],
    },
  },
})
