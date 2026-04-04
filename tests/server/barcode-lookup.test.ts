import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock h3/nitro auto-imports ---
const mockGetQuery = vi.fn()
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.message)
  ;(err as any).statusCode = opts.statusCode
  return err
})
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('createError', mockCreateError)
vi.stubGlobal('defineEventHandler', (handler: Function) => handler)

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const handler = (await import('../../server/api/barcode-lookup')).default as any

describe('barcode-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeEvent(cloudflareEnv: Record<string, string> = {}) {
    return {
      context: {
        cloudflare: {
          env: cloudflareEnv,
        },
      },
    }
  }

  // --- Validation errors ---

  it('throws 400 when code parameter is missing', async () => {
    mockGetQuery.mockReturnValue({})
    await expect(handler(makeEvent())).rejects.toThrow('code parameter is required')
    expect(mockCreateError).toHaveBeenCalledWith({ statusCode: 400, message: 'code parameter is required' })
  })

  it('throws 400 when code is empty string', async () => {
    mockGetQuery.mockReturnValue({ code: '  ' })
    await expect(handler(makeEvent())).rejects.toThrow('code parameter is required')
  })

  it('throws 500 when Rakuten API credentials are not configured (both missing)', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    await expect(handler(makeEvent())).rejects.toThrow('Rakuten API credentials not configured')
    expect(mockCreateError).toHaveBeenCalledWith({ statusCode: 500, message: 'Rakuten API credentials not configured' })
  })

  it('throws 500 when only appId is missing', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    await expect(handler(makeEvent({ RAKUTEN_ACCESS_KEY: 'key' }))).rejects.toThrow('Rakuten API credentials not configured')
  })

  it('throws 500 when only accessKey is missing', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    await expect(handler(makeEvent({ RAKUTEN_APP_ID: 'id' }))).rejects.toThrow('Rakuten API credentials not configured')
  })

  // --- API responses ---

  it('returns found:false when API returns 404', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue('Not Found'),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({ found: false })
  })

  it('throws createError when API returns non-404 error', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    })

    await expect(handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))).rejects.toThrow('Service Unavailable')
    expect(mockCreateError).toHaveBeenCalledWith({ statusCode: 503, message: 'Service Unavailable' })
  })

  it('returns found:false when count is 0', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 0, Products: [] }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({ found: false })
  })

  it('returns found:false when Products array is empty', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 1, Products: [] }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({ found: false })
  })

  it('returns found:false when count is undefined', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ Products: [{ Product: {} }] }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({ found: false })
  })

  it('returns found:false when Products is undefined', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 1 }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({ found: false })
  })

  it('returns product info on success', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        count: 1,
        Products: [{
          Product: {
            productName: 'Test Product',
            brandName: 'Test Brand',
            makerName: 'Test Maker',
            productCaption: 'A test product',
            genreName: 'Electronics',
            mediumImageUrl: 'https://img.rakuten.com/test.jpg',
          },
        }],
      }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({
      found: true,
      name: 'Test Product',
      brand: 'Test Brand',
      maker: 'Test Maker',
      category: 'Electronics',
      description: 'A test product',
      imageUrl: 'https://img.rakuten.com/test.jpg',
    })
  })

  it('returns empty strings for missing product fields', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        count: 1,
        Products: [{
          Product: {},
        }],
      }),
    })

    const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
    expect(result).toEqual({
      found: true,
      name: '',
      brand: '',
      maker: '',
      category: '',
      description: '',
      imageUrl: '',
    })
  })

  // --- Cloudflare env edge cases ---

  it('handles missing cloudflare context', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    const event = { context: {} }
    // cloudflare is undefined, so env = {} → appId and accessKey are empty
    await expect(handler(event)).rejects.toThrow('Rakuten API credentials not configured')
  })

  it('handles cloudflare.env being undefined', async () => {
    mockGetQuery.mockReturnValue({ code: '4901234567890' })
    const event = { context: { cloudflare: {} } }
    await expect(handler(event)).rejects.toThrow('Rakuten API credentials not configured')
  })

  it('sends correct fetch URL with encoded barcode', async () => {
    mockGetQuery.mockReturnValue({ code: '490 123' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 0 }),
    })

    await handler(makeEvent({ RAKUTEN_APP_ID: 'myApp', RAKUTEN_ACCESS_KEY: 'myKey' }))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('productCode=490%20123'),
      expect.objectContaining({
        headers: {
          Referer: 'https://items.mtamaramu.com/',
          Origin: 'https://items.mtamaramu.com',
        },
      }),
    )
  })
})
