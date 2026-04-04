import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock h3/nitro auto-imports ---
const mockGetRequestURL = vi.fn()
const mockGetCookie = vi.fn()
const mockSetCookie = vi.fn()
const mockSendRedirect = vi.fn()
const mockUseRuntimeConfig = vi.fn()
vi.stubGlobal('getRequestURL', mockGetRequestURL)
vi.stubGlobal('getCookie', mockGetCookie)
vi.stubGlobal('setCookie', mockSetCookie)
vi.stubGlobal('sendRedirect', mockSendRedirect)
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)
vi.stubGlobal('defineEventHandler', (handler: Function) => handler)

const handler = (await import('../../server/middleware/auth')).default as any

describe('auth-middleware', () => {
  const event = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRuntimeConfig.mockReturnValue({
      public: { authWorkerUrl: 'https://auth.example.com' },
    })
    mockSendRedirect.mockReturnValue('redirected')
  })

  // --- getParentDomainFromHost ---
  // Tested indirectly through the ?lw= branch which calls setCookie with domain

  // --- Skip paths ---

  it('skips API paths', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/api/some-endpoint'))
    const result = handler(event)
    expect(result).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  it('skips /api/ nested paths', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/api/deep/nested'))
    const result = handler(event)
    expect(result).toBeUndefined()
  })

  // --- Has cookie → skip ---

  it('skips when logi_auth_token cookie exists', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/'))
    mockGetCookie.mockImplementation((_event: any, name: string) => {
      if (name === 'logi_auth_token') return 'valid-token'
      return undefined
    })

    const result = handler(event)
    expect(result).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  // --- No authWorkerUrl config → skip ---

  it('skips when authWorkerUrl is not configured', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/'))
    mockGetCookie.mockReturnValue(undefined)
    mockUseRuntimeConfig.mockReturnValue({ public: { authWorkerUrl: '' } })

    const result = handler(event)
    expect(result).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  // --- ?lw_callback → skip ---

  it('skips when lw_callback query param is present', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/?lw_callback=1'))
    mockGetCookie.mockReturnValue(undefined)

    const result = handler(event)
    expect(result).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  // --- ?logout → skip ---

  it('skips when logout query param is present', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/?logout'))
    mockGetCookie.mockReturnValue(undefined)

    const result = handler(event)
    expect(result).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  // --- ?lw=<domain> → set cookie + redirect to LINE WORKS ---

  it('sets lw_domain cookie and redirects to LINE WORKS OAuth', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.mtamaramu.com/?lw=ohishi'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    // setCookie called with parent domain
    expect(mockSetCookie).toHaveBeenCalledWith(
      event,
      'lw_domain',
      'ohishi',
      expect.objectContaining({
        domain: '.mtamaramu.com',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
        secure: true,
        sameSite: 'lax',
      }),
    )

    // Redirect to auth worker
    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      expect.stringContaining('https://auth.example.com/api/auth/lineworks/redirect?'),
    )
    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    expect(redirectUrl).toContain('domain=ohishi')
    expect(redirectUrl).toContain('redirect_uri=')
    // lw_callback is inside the redirect_uri param (URL-encoded)
    const params = new URL(redirectUrl)
    const redirectUri = params.searchParams.get('redirect_uri')!
    expect(new URL(redirectUri).searchParams.get('lw_callback')).toBe('1')
  })

  it('sets lw_domain cookie without parent domain for two-part hostname', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://example.com/?lw=ohishi'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    // getParentDomainFromHost returns undefined for two-part domain
    expect(mockSetCookie).toHaveBeenCalledWith(
      event,
      'lw_domain',
      'ohishi',
      expect.objectContaining({
        domain: undefined,
      }),
    )
  })

  it('preserves share_target params (url, text, title) in redirect_uri', () => {
    mockGetRequestURL.mockReturnValue(
      new URL('https://app.mtamaramu.com/?lw=ohishi&url=https%3A%2F%2Fexample.com&text=hello&title=Test'),
    )
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    const params = new URL(redirectUrl)
    const redirectUri = params.searchParams.get('redirect_uri')!
    const redirectUriParams = new URL(redirectUri)
    expect(redirectUriParams.searchParams.get('url')).toBe('https://example.com')
    expect(redirectUriParams.searchParams.get('text')).toBe('hello')
    expect(redirectUriParams.searchParams.get('title')).toBe('Test')
    expect(redirectUriParams.searchParams.get('lw_callback')).toBe('1')
  })

  // --- lw_domain cookie → redirect to LINE WORKS ---

  it('redirects to LINE WORKS when lw_domain cookie exists', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.mtamaramu.com/'))
    mockGetCookie.mockImplementation((_event: any, name: string) => {
      if (name === 'lw_domain') return 'saved-domain'
      return undefined
    })

    handler(event)

    expect(mockSetCookie).not.toHaveBeenCalled()
    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      expect.stringContaining('https://auth.example.com/api/auth/lineworks/redirect?'),
    )
    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    expect(redirectUrl).toContain('domain=saved-domain')
    // lw_callback is inside the redirect_uri param (URL-encoded)
    const params = new URL(redirectUrl)
    const redirectUri = params.searchParams.get('redirect_uri')!
    expect(new URL(redirectUri).searchParams.get('lw_callback')).toBe('1')
  })

  // --- Default: redirect to auth login page ---

  it('redirects to auth login page by default', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      expect.stringContaining('https://auth.mtamaramu.com/login?redirect_uri='),
    )
    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    // lw_callback is inside the redirect_uri param (URL-encoded)
    const fullUrl = new URL(redirectUrl)
    const redirectUri = fullUrl.searchParams.get('redirect_uri')!
    expect(new URL(redirectUri).searchParams.get('lw_callback')).toBe('1')
  })

  // --- share_target params not present ---

  it('does not include share_target params when not present', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    // redirect_uri should only have lw_callback
    expect(redirectUrl).not.toContain('url=')
    expect(redirectUrl).not.toContain('text=')
    expect(redirectUrl).not.toContain('title=')
  })

  // --- share_target params partial ---

  it('preserves only present share_target params', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/?text=partial'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    const redirectUrl = mockSendRedirect.mock.calls[0][1]
    // Decode the redirect_uri
    const fullUrl = new URL(redirectUrl)
    const redirectUri = fullUrl.searchParams.get('redirect_uri')!
    const params = new URL(redirectUri)
    expect(params.searchParams.get('text')).toBe('partial')
    expect(params.searchParams.has('url')).toBe(false)
    expect(params.searchParams.has('title')).toBe(false)
    expect(params.searchParams.get('lw_callback')).toBe('1')
  })

  // --- getParentDomainFromHost with deep subdomain ---

  it('extracts parent domain from deep subdomain', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://sub.deep.mtamaramu.com/?lw=test'))
    mockGetCookie.mockReturnValue(undefined)

    handler(event)

    expect(mockSetCookie).toHaveBeenCalledWith(
      event,
      'lw_domain',
      'test',
      expect.objectContaining({
        domain: '.mtamaramu.com',
      }),
    )
  })

  // --- getCookie call order: logi_auth_token first, then lw_domain ---

  it('checks logi_auth_token before lw_domain', () => {
    mockGetRequestURL.mockReturnValue(new URL('https://app.example.com/'))
    // First call (logi_auth_token) returns undefined, second (lw_domain) returns value
    let callCount = 0
    mockGetCookie.mockImplementation((_event: any, name: string) => {
      callCount++
      if (name === 'logi_auth_token') return undefined
      if (name === 'lw_domain') return 'domain-val'
      return undefined
    })

    handler(event)

    // Should redirect via lw_domain path
    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      expect.stringContaining('domain=domain-val'),
    )
  })
})
