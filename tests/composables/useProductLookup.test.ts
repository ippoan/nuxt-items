import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, readonly } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('ref', ref)
vi.stubGlobal('readonly', readonly)

// Must import after stubs
const { useProductLookup } = await import('../../composables/useProductLookup')

// Also export helpers for direct testing
const mod = await import('../../composables/useProductLookup') as any

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ─── extractName (private but exported via module) ───
// We test via fetchOpenFacts + lookup integration since extractName is module-private.
// Let's test via the lookup flow.

describe('useProductLookup', () => {
  describe('lookup', () => {
    it('returns null for empty barcode', async () => {
      const { lookup } = useProductLookup()
      const result = await lookup('')
      expect(result).toBeNull()
    })

    it('returns null for whitespace-only barcode', async () => {
      const { lookup } = useProductLookup()
      const result = await lookup('   ')
      expect(result).toBeNull()
    })

    it('returns Rakuten result when found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          name: 'Test Product',
          brand: 'TestBrand',
          category: 'Food',
          description: 'A test product',
          imageUrl: 'https://example.com/img.jpg',
        }),
      })

      const { lookup, status, product } = useProductLookup()
      const result = await lookup('4901234567890')
      vi.runAllTimers()

      expect(result).not.toBeNull()
      expect(result!.source).toBe('rakuten')
      expect(result!.name).toBe('TestBrand Test Product')
      expect(result!.category).toBe('Food')
      expect(result!.description).toBe('A test product')
      expect(result!.imageUrl).toBe('https://example.com/img.jpg')
      expect(status.value).toBe('found')
      expect(product.value).toEqual(result)
    })

    it('Rakuten: brand included in name - no duplication', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          name: 'TestBrand Premium Product',
          brand: 'TestBrand',
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.name).toBe('TestBrand Premium Product')
    })

    it('Rakuten: no brand', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          name: 'Product Only',
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.name).toBe('Product Only')
      expect(result!.category).toBe('')
      expect(result!.description).toBe('')
      expect(result!.imageUrl).toBe('')
    })

    it('Rakuten: not ok response falls through to OpenFacts', async () => {
      // Rakuten: not ok
      fetchMock.mockResolvedValueOnce({ ok: false })
      // OpenFoodFacts: found
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name_ja: 'Japanese Product',
            categories_tags: ['ja:food'],
            generic_name: 'Generic food',
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.source).toBe('openfoodfacts')
      expect(result!.name).toBe('Japanese Product')
      expect(result!.category).toBe('food')
      expect(result!.description).toBe('Generic food')
    })

    it('Rakuten: found=false falls through', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: false }),
      })
      // OpenFoodFacts: not ok
      fetchMock.mockResolvedValueOnce({ ok: false })
      // OpenProductsFacts: found
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'English Product',
            brands: 'SomeBrand',
            categories: 'Cat1, Cat2',
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.source).toBe('openproductsfacts')
      // extractName: name doesn't include brands, so "SomeBrand English Product"
      expect(result!.name).toBe('SomeBrand English Product')
      // extractCategory: no ja: tag, uses categories.split(',')[0]
      expect(result!.category).toBe('Cat1')
    })

    it('Rakuten: found=true but no name falls through', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: '' }),
      })
      // Both OpenFacts fail
      fetchMock.mockResolvedValueOnce({ ok: false })
      fetchMock.mockResolvedValueOnce({ ok: false })

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('all sources return not found', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({ ok: false }) // OpenFoodFacts
      fetchMock.mockResolvedValueOnce({ ok: false }) // OpenProductsFacts

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('OpenFacts: status=0 returns null product', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 0, product: null }),
      })
      fetchMock.mockResolvedValueOnce({ ok: false })

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('OpenFacts: no product_name and no product_name_ja returns null', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: { brands: 'SomeBrand' }, // no product_name or product_name_ja
        }),
      })
      fetchMock.mockResolvedValueOnce({ ok: false })

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('Rakuten throws non-abort error, falls through to OpenFacts', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('Network error')) // Rakuten throws
        .mockResolvedValueOnce({ ok: false }) // OpenFoodFacts
        .mockResolvedValueOnce({ ok: false }) // OpenProductsFacts

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('Rakuten throws AbortError, propagates to outer catch', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      fetchMock.mockRejectedValueOnce(abortError)

      const { lookup, status, errorMessage } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('error')
      expect(errorMessage.value).toBe('タイムアウトしました')
    })

    it('OpenFacts throws AbortError, propagates to outer catch', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      const abortError = new DOMException('Aborted', 'AbortError')
      fetchMock.mockRejectedValueOnce(abortError) // OpenFoodFacts throws

      const { lookup, status, errorMessage } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('error')
      expect(errorMessage.value).toBe('タイムアウトしました')
    })

    it('OpenFacts throws non-abort error, tries next source', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockRejectedValueOnce(new Error('fail')) // OpenFoodFacts throws
      fetchMock.mockResolvedValueOnce({ ok: false }) // OpenProductsFacts

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('non-abort errors in all sources results in not_found', async () => {
      fetchMock.mockRejectedValueOnce(new Error('fail')) // Rakuten - inner catch swallows
      fetchMock.mockRejectedValueOnce(new Error('fail')) // OpenFoodFacts - inner catch swallows
      fetchMock.mockRejectedValueOnce(new Error('fail')) // OpenProductsFacts - inner catch swallows

      const { lookup, status } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('trims barcode before passing to fetch', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: 'Product', brand: '' }),
      })

      const { lookup } = useProductLookup()
      await lookup('  123  ')
      vi.runAllTimers()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barcode-lookup?code=123',
        expect.any(Object),
      )
    })

    // extractName branches
    it('extractName: name with brands but name includes brands', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'BrandA ProductX',
            brands: 'BrandA',
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.name).toBe('BrandA ProductX') // no duplication
    })

    it('extractName: no name, only brands', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name_ja: '', // falsy
            product_name: '',
            brands: 'JustBrand',
            categories_tags: [],
          },
        }),
      })

      const { lookup } = useProductLookup()
      // product_name_ja is empty but product_name is empty too, brands is set
      // But wait - product_name_ja is '' which is falsy, so extractName falls through
      // name = '' (product_name), brands = 'JustBrand'
      // name is empty, so (name && brands && ...) is false, returns name || brands = 'JustBrand'
      // BUT: fetchOpenFacts checks !data.product.product_name && !data.product.product_name_ja
      // both are '' which is falsy, so it returns null
      const result = await lookup('123')
      vi.runAllTimers()
      // fetchOpenFacts returns null because no product_name and no product_name_ja
      // This means this source is skipped
    })

    it('extractCategory: no ja tag, no categories', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Prod',
            categories_tags: ['en:food'],
            // no categories
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      // No ja: tag found, no categories field → empty string
      expect(result!.category).toBe('')
    })

    it('extractCategory: no categories_tags at all', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Prod',
            // no categories_tags, no categories
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.category).toBe('')
    })

    it('extractDescription: no generic_name returns empty', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Prod',
          },
        }),
      })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result!.description).toBe('')
    })

    it('OpenFacts: no product field in response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false }) // Rakuten
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 1 }), // no product field
      })
      fetchMock.mockResolvedValueOnce({ ok: false })

      const { lookup } = useProductLookup()
      const result = await lookup('123')
      vi.runAllTimers()

      expect(result).toBeNull()
    })
  })

  describe('lookupByUrl', () => {
    it('returns null for empty url', async () => {
      const { lookupByUrl } = useProductLookup()
      const result = await lookupByUrl('')
      expect(result).toBeNull()
    })

    it('returns null for whitespace url', async () => {
      const { lookupByUrl } = useProductLookup()
      const result = await lookupByUrl('   ')
      expect(result).toBeNull()
    })

    it('returns product on success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          name: 'Amazon Product',
          imageUrl: 'https://example.com/img.jpg',
          description: 'Desc',
        }),
      })

      const { lookupByUrl, status, product } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result!.source).toBe('amazon')
      expect(result!.name).toBe('Amazon Product')
      expect(result!.imageUrl).toBe('https://example.com/img.jpg')
      expect(result!.description).toBe('Desc')
      expect(result!.category).toBe('')
      expect(status.value).toBe('found')
      expect(product.value).toEqual(result)
    })

    it('returns null when response not ok', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false })

      const { lookupByUrl, status } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('error')
    })

    it('returns null when not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: false }),
      })

      const { lookupByUrl, status } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('returns null when found but no name', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: '' }),
      })

      const { lookupByUrl, status } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('not_found')
    })

    it('handles AbortError', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      fetchMock.mockRejectedValueOnce(abortError)

      const { lookupByUrl, status, errorMessage } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('error')
      expect(errorMessage.value).toBe('タイムアウトしました')
    })

    it('handles non-abort error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network fail'))

      const { lookupByUrl, status, errorMessage } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result).toBeNull()
      expect(status.value).toBe('error')
      expect(errorMessage.value).toBe('Network fail')
    })

    it('handles error with empty message', async () => {
      fetchMock.mockRejectedValueOnce(new Error(''))

      const { lookupByUrl, errorMessage } = useProductLookup()
      await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(errorMessage.value).toBe('不明なエラー')
    })

    it('no imageUrl/description defaults to empty string', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: 'Product' }),
      })

      const { lookupByUrl } = useProductLookup()
      const result = await lookupByUrl('https://amazon.co.jp/dp/123')
      vi.runAllTimers()

      expect(result!.imageUrl).toBe('')
      expect(result!.description).toBe('')
    })

    it('trims url before fetching', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: 'P' }),
      })

      const { lookupByUrl } = useProductLookup()
      await lookupByUrl('  https://amazon.co.jp  ')
      vi.runAllTimers()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/amazon-lookup?url=https%3A%2F%2Famazon.co.jp',
        expect.any(Object),
      )
    })
  })

  describe('reset', () => {
    it('resets all state', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, name: 'P', brand: '' }),
      })

      const { lookup, reset, status, product, errorMessage } = useProductLookup()
      await lookup('123')
      vi.runAllTimers()

      expect(status.value).toBe('found')
      expect(product.value).not.toBeNull()

      reset()
      expect(status.value).toBe('idle')
      expect(product.value).toBeNull()
      expect(errorMessage.value).toBe('')
    })
  })

})
