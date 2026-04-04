import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isLive, liveGet, stubNitroGlobals } from '../helpers/api-test-env'

// --- Mock mode setup ---
const mockFetch = vi.fn()
let handler: any
let mocks: Record<string, ReturnType<typeof vi.fn>>

if (!isLive) {
  mocks = stubNitroGlobals()
  vi.stubGlobal('fetch', mockFetch)
  handler = (await import('../../server/api/amazon-lookup')).default as any
}

describe('amazon-lookup', () => {
  const event = {} as any

  beforeEach(() => {
    if (!isLive) vi.clearAllMocks()
  })

  // --- Error cases (both modes) ---

  it('throws 400 if url parameter is missing', async () => {
    if (isLive) {
      const res = await liveGet('/api/amazon-lookup')
      expect(res.status).toBe(400)
    } else {
      mocks.getQuery.mockReturnValue({})
      await expect(handler(event)).rejects.toThrow('url parameter is required')
      expect(mocks.createError).toHaveBeenCalledWith({ statusCode: 400, message: 'url parameter is required' })
    }
  })

  it('throws 400 if url is empty string', async () => {
    if (isLive) {
      const res = await liveGet('/api/amazon-lookup', { url: '  ' })
      expect(res.status).toBe(400)
    } else {
      mocks.getQuery.mockReturnValue({ url: '  ' })
      await expect(handler(event)).rejects.toThrow('url parameter is required')
    }
  })

  it('throws 400 if url is not an Amazon URL', async () => {
    if (isLive) {
      const res = await liveGet('/api/amazon-lookup', { url: 'https://example.com/product' })
      expect(res.status).toBe(400)
    } else {
      mocks.getQuery.mockReturnValue({ url: 'https://example.com/product' })
      await expect(handler(event)).rejects.toThrow('Not a recognized Amazon URL')
      expect(mocks.createError).toHaveBeenCalledWith({ statusCode: 400, message: 'Not a recognized Amazon URL' })
    }
  })

  // --- Live mode: response shape verification ---

  describe.skipIf(!isLive)('live response shape', () => {
    it('extracts product info from Amazon URL', async () => {
      const res = await liveGet('/api/amazon-lookup', { url: 'https://www.amazon.co.jp/dp/B08N5WRWNW' })
      expect(res.data).toHaveProperty('found')
      expect(res.data).toHaveProperty('name')
      expect(res.data).toHaveProperty('asin')
    })

    it('handles short URL (amzn.to)', async () => {
      const res = await liveGet('/api/amazon-lookup', { url: 'https://amzn.to/3xyz' })
      // May or may not resolve, but should return valid shape
      expect(res.status).toBe(200)
      expect(res.data).toHaveProperty('found')
    })
  })

  // --- Mock-only tests ---

  describe.skipIf(isLive)('OG extraction', () => {
    it('returns product info from OG meta tags (property="og:title")', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/%E5%95%86%E5%93%81/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/%E5%95%86%E5%93%81/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(
          '<meta property="og:title" content="Test Product">' +
          '<meta property="og:image" content="https://img.amazon.com/test.jpg">' +
          '<meta property="og:description" content="A great product">',
        ),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Test Product',
        imageUrl: 'https://img.amazon.com/test.jpg',
        description: 'A great product',
        asin: 'B08N5WRWNW',
      })
    })

    it('returns product info from OG meta tags (content before property - alternate format)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/%E5%95%86%E5%93%81/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/%E5%95%86%E5%93%81/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(
          '<meta content="Alt Product" property="og:title">' +
          '<meta content="https://img.amazon.com/alt.jpg" property="og:image">' +
          '<meta content="Alt description" property="og:description">',
        ),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Alt Product',
        imageUrl: 'https://img.amazon.com/alt.jpg',
        description: 'Alt description',
        asin: 'B08N5WRWNW',
      })
    })

    it('decodes HTML entities in name and description', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(
          '<meta property="og:title" content="A &amp; B &lt;C&gt; &quot;D&quot; &#039;E&#x27;">' +
          '<meta property="og:description" content="&amp; &lt; &gt; &quot; &#039; &#x27;">',
        ),
      })

      const result = await handler(event)
      expect(result.name).toBe("A & B <C> \"D\" 'E'")
      expect(result.description).toBe("& < > \" ' '")
    })

    it('extracts OG tags using name= attribute', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(
          '<meta name="og:title" content="Name Attr Product">' +
          '<meta name="og:image" content="https://img.amazon.com/name.jpg">' +
          '<meta name="og:description" content="Name desc">',
        ),
      })

      const result = await handler(event)
      expect(result.name).toBe('Name Attr Product')
      expect(result.imageUrl).toBe('https://img.amazon.com/name.jpg')
      expect(result.description).toBe('Name desc')
    })

    it('returns empty string for missing OG image', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(
          '<meta property="og:title" content="No Image Product">',
        ),
      })

      const result = await handler(event)
      expect(result.found).toBe(true)
      expect(result.name).toBe('No Image Product')
      expect(result.imageUrl).toBe('')
      expect(result.description).toBe('')
    })

    it('returns empty asin on OG success when no ASIN in URL', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://amzn.to/3abc' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/some-page',
        text: vi.fn().mockResolvedValue('<meta property="og:title" content="Product Name">'),
      })

      const result = await handler(event)
      expect(result.found).toBe(true)
      expect(result.name).toBe('Product Name')
      expect(result.asin).toBe('')
    })
  })

  describe.skipIf(isLive)('URL path fallback', () => {
    it('falls back to URL path when OG name is empty (res.ok but no OG tags)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/Some-Product-Name/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/Some-Product-Name/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue('<html><body>No OG tags</body></html>'),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Some Product Name',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })

    it('falls back to URL path when response is not ok', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/Another-Product/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/Another-Product/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(''),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Another Product',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })

    it('uses finalUrl for extractNameFromPath, falls back to rawUrl', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/Product-Name/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(''),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Product Name',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })

    it('returns found:false when no name can be extracted (not ok, no path name)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/dp/B08N5WRWNW',
        text: vi.fn().mockResolvedValue(''),
      })

      const result = await handler(event)
      expect(result).toEqual({
        found: false,
        name: '',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })
  })

  describe.skipIf(isLive)('network error fallback', () => {
    it('falls back to URL path extraction on fetch error', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/Error-Product/dp/B08N5WRWNW' })
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await handler(event)
      expect(result).toEqual({
        found: true,
        name: 'Error Product',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })

    it('returns found:false on fetch error when no name in URL path', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/dp/B08N5WRWNW' })
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await handler(event)
      expect(result).toEqual({
        found: false,
        name: '',
        imageUrl: '',
        description: '',
        asin: 'B08N5WRWNW',
      })
    })

    it('handles fetch error with no ASIN in URL', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://amzn.asia/d/something' })
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await handler(event)
      expect(result).toEqual({
        found: false,
        name: '',
        imageUrl: '',
        description: '',
        asin: '',
      })
    })

    it('handles extractNameFromPath with invalid URL gracefully (network error path)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://amzn.to/short' })
      mockFetch.mockRejectedValue(new Error('fail'))

      const result = await handler(event)
      expect(result.found).toBe(false)
      expect(result.name).toBe('')
    })
  })

  describe.skipIf(isLive)('Amazon URL validation', () => {
    it('accepts various Amazon domains', async () => {
      const domains = [
        'https://www.amazon.co.jp/dp/B08N5WRWNW',
        'https://amazon.co.jp/dp/B08N5WRWNW',
        'https://www.amazon.com/dp/B08N5WRWNW',
        'https://www.amazon.jp/dp/B08N5WRWNW',
        'https://www.amazon.co.uk/dp/B08N5WRWNW',
        'https://www.amazon.de/dp/B08N5WRWNW',
        'https://www.amazon.fr/dp/B08N5WRWNW',
        'https://www.amazon.it/dp/B08N5WRWNW',
        'https://www.amazon.es/dp/B08N5WRWNW',
        'https://www.amazon.ca/dp/B08N5WRWNW',
        'https://amzn.asia/d/abc',
        'https://amzn.to/3xyz',
      ]
      for (const url of domains) {
        mocks.getQuery.mockReturnValue({ url })
        mockFetch.mockRejectedValue(new Error('skip'))
        await handler(event) // should not throw 400
      }
    })

    it('rejects invalid URL (unparseable)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'not-a-valid-url' })
      await expect(handler(event)).rejects.toThrow('Not a recognized Amazon URL')
    })
  })

  describe.skipIf(isLive)('ASIN extraction', () => {
    it('extracts ASIN from gp/product path', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/gp/product/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/gp/product/B08N5WRWNW',
        text: vi.fn().mockResolvedValue('<meta property="og:title" content="GP Product">'),
      })

      const result = await handler(event)
      expect(result.asin).toBe('B08N5WRWNW')
    })

    it('uses ASIN from redirected URL (finalUrl) over rawUrl', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://amzn.asia/d/something' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/Redirected-Product/dp/B99NEWASI1',
        text: vi.fn().mockResolvedValue('<meta property="og:title" content="Redirected">'),
      })

      const result = await handler(event)
      expect(result.asin).toBe('B99NEWASI1')
    })

    it('falls back to rawUrl ASIN when finalUrl has no ASIN', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/test/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://www.amazon.co.jp/no-asin-here',
        text: vi.fn().mockResolvedValue('<meta property="og:title" content="Product">'),
      })

      const result = await handler(event)
      expect(result.asin).toBe('B08N5WRWNW')
    })

    it('returns empty asin when neither finalUrl nor rawUrl has ASIN', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://amzn.to/3xyz' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/something',
      })

      const result = await handler(event)
      expect(result.asin).toBe('')
    })
  })

  describe.skipIf(isLive)('extractNameFromPath edge cases', () => {
    it('excludes short names (length <= 2)', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/AB/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/AB/dp/B08N5WRWNW',
      })

      const result = await handler(event)
      expect(result.name).toBe('')
    })

    it('excludes ref= paths', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/ref%3Dtest/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/ref%3Dtest/dp/B08N5WRWNW',
      })

      const result = await handler(event)
      expect(result.name).toBe('')
    })

    it('excludes gp/ paths', async () => {
      mocks.getQuery.mockReturnValue({ url: 'https://www.amazon.co.jp/gp%2Fsomething/dp/B08N5WRWNW' })
      mockFetch.mockResolvedValue({
        ok: false,
        url: 'https://www.amazon.co.jp/gp%2Fsomething/dp/B08N5WRWNW',
      })

      const result = await handler(event)
      expect(result.name).toBe('')
    })
  })
})
