import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isLive, liveGet, stubNitroGlobals } from '../helpers/api-test-env'

// --- Mock mode setup ---
const mockFetch = vi.fn()
let handler: any
let mocks: Record<string, ReturnType<typeof vi.fn>>

if (!isLive) {
  mocks = stubNitroGlobals()
  vi.stubGlobal('fetch', mockFetch)
  handler = (await import('../../server/api/barcode-lookup')).default as any
}

describe('barcode-lookup', () => {
  beforeEach(() => {
    if (!isLive) vi.clearAllMocks()
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

  // --- Validation errors (both modes) ---

  it('throws 400 when code parameter is missing', async () => {
    if (isLive) {
      const res = await liveGet('/api/barcode-lookup')
      expect(res.status).toBe(400)
    } else {
      mocks.getQuery.mockReturnValue({})
      await expect(handler(makeEvent())).rejects.toThrow('code parameter is required')
      expect(mocks.createError).toHaveBeenCalledWith({ statusCode: 400, message: 'code parameter is required' })
    }
  })

  it('throws 400 when code is empty string', async () => {
    if (isLive) {
      const res = await liveGet('/api/barcode-lookup', { code: '  ' })
      expect(res.status).toBe(400)
    } else {
      mocks.getQuery.mockReturnValue({ code: '  ' })
      await expect(handler(makeEvent())).rejects.toThrow('code parameter is required')
    }
  })

  // --- Live mode: real barcode lookup ---

  describe.skipIf(!isLive)('live barcode lookup', () => {
    it('returns product info for a known JAN code', async () => {
      const res = await liveGet('/api/barcode-lookup', { code: '4901777337503' })
      // Server needs RAKUTEN credentials; if configured, should return a result
      if (res.status === 200) {
        expect(res.data).toHaveProperty('found')
        if (res.data.found) {
          expect(res.data).toHaveProperty('name')
          expect(res.data).toHaveProperty('brand')
        }
      } else {
        // 500 = credentials not configured on server, acceptable in live test
        expect(res.status).toBe(500)
      }
    })

    it('returns found:false for non-existent barcode', async () => {
      const res = await liveGet('/api/barcode-lookup', { code: '0000000000000' })
      if (res.status === 200) {
        expect(res.data.found).toBe(false)
      } else {
        expect(res.status).toBe(500) // credentials not configured
      }
    })
  })

  // --- Mock-only tests ---

  describe.skipIf(isLive)('credential validation', () => {
    it('throws 500 when Rakuten API credentials are not configured (both missing)', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      await expect(handler(makeEvent())).rejects.toThrow('Rakuten API credentials not configured')
      expect(mocks.createError).toHaveBeenCalledWith({ statusCode: 500, message: 'Rakuten API credentials not configured' })
    })

    it('throws 500 when only appId is missing', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      await expect(handler(makeEvent({ RAKUTEN_ACCESS_KEY: 'key' }))).rejects.toThrow('Rakuten API credentials not configured')
    })

    it('throws 500 when only accessKey is missing', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      await expect(handler(makeEvent({ RAKUTEN_APP_ID: 'id' }))).rejects.toThrow('Rakuten API credentials not configured')
    })
  })

  describe.skipIf(isLive)('API responses', () => {
    it('returns found:false when API returns 404', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Not Found'),
      })

      const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
      expect(result).toEqual({ found: false })
    })

    it('throws createError when API returns non-404 error', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service Unavailable'),
      })

      await expect(handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))).rejects.toThrow('Service Unavailable')
      expect(mocks.createError).toHaveBeenCalledWith({ statusCode: 503, message: 'Service Unavailable' })
    })

    it('returns found:false when count is 0', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 0, Products: [] }),
      })

      const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
      expect(result).toEqual({ found: false })
    })

    it('returns found:false when Products array is empty', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1, Products: [] }),
      })

      const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
      expect(result).toEqual({ found: false })
    })

    it('returns found:false when count is undefined', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ Products: [{ Product: {} }] }),
      })

      const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
      expect(result).toEqual({ found: false })
    })

    it('returns found:false when Products is undefined', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      })

      const result = await handler(makeEvent({ RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }))
      expect(result).toEqual({ found: false })
    })

    it('returns product info on success', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
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
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
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
  })

  describe.skipIf(isLive)('Cloudflare env edge cases', () => {
    it('handles missing cloudflare context', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      const event = { context: {} }
      await expect(handler(event)).rejects.toThrow('Rakuten API credentials not configured')
    })

    it('handles cloudflare.env being undefined', async () => {
      mocks.getQuery.mockReturnValue({ code: '4901234567890' })
      const event = { context: { cloudflare: {} } }
      await expect(handler(event)).rejects.toThrow('Rakuten API credentials not configured')
    })

    it('sends correct fetch URL with encoded barcode', async () => {
      mocks.getQuery.mockReturnValue({ code: '490 123' })
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
})
