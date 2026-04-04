import { describe, it, expect, vi } from 'vitest'

// Stub the external module so import succeeds
vi.stubGlobal('__ippoan_auth_client__', true)
vi.mock('@ippoan/auth-client', () => ({
  useAuth: () => ({ token: { value: 'mock' } }),
  AuthToolbar: { name: 'AuthToolbar' },
  AuthState: {},
}))

describe('useAuth', () => {
  it('re-exports useAuth and AuthToolbar', async () => {
    const mod = await import('../../composables/useAuth')
    expect(mod.useAuth).toBeDefined()
    expect(mod.AuthToolbar).toBeDefined()
    // Call useAuth to cover the re-export
    const auth = mod.useAuth()
    expect(auth.token.value).toBe('mock')
  })
})
