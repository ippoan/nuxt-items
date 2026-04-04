import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname),
      '#app': resolve(__dirname, '.nuxt/app'),
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
        'utils/**/*.ts',
      ],
      exclude: [
        'composables/useAuth.ts',
        'utils/api.ts',
      ],
    },
  },
})
