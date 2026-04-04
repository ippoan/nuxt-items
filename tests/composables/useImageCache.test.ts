import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('ref', ref)
vi.stubGlobal('useState', (_key: string, init: () => any) => ref(init()))

const mockDownloadImageAsObjectUrl = vi.fn()

vi.stubGlobal('useFileUpload', () => ({
  downloadImageAsObjectUrl: mockDownloadImageAsObjectUrl,
}))

vi.stubGlobal('useNuxtApp', () => ({
  $grpc: { files: { createFile: vi.fn(), downloadFile: vi.fn() } },
}))

const { useImageCache } = await import('../../composables/useImageCache')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useImageCache', () => {
  describe('getImageUrl', () => {
    it('returns null for empty uuid', async () => {
      const { getImageUrl } = useImageCache()
      const result = await getImageUrl('')
      expect(result).toBeNull()
    })

    it('returns cached url on cache hit', async () => {
      const { getImageUrl, cache } = useImageCache()
      cache.value['uuid-1'] = 'blob:cached-url'

      const result = await getImageUrl('uuid-1')
      expect(result).toBe('blob:cached-url')
      expect(mockDownloadImageAsObjectUrl).not.toHaveBeenCalled()
    })

    it('returns null when already loading (loading guard)', async () => {
      const { getImageUrl } = useImageCache()

      // First call starts loading
      mockDownloadImageAsObjectUrl.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('blob:url'), 100)),
      )

      const promise1 = getImageUrl('uuid-2')

      // Second call while first is still loading
      const result2 = await getImageUrl('uuid-2')
      expect(result2).toBeNull()

      // Wait for first to complete
      await promise1
    })

    it('downloads and caches on cache miss', async () => {
      mockDownloadImageAsObjectUrl.mockResolvedValue('blob:new-url')

      const { getImageUrl, cache } = useImageCache()
      const result = await getImageUrl('uuid-3')

      expect(result).toBe('blob:new-url')
      expect(cache.value['uuid-3']).toBe('blob:new-url')
      expect(mockDownloadImageAsObjectUrl).toHaveBeenCalledWith('uuid-3')
    })

    it('returns null and does not cache when download returns null', async () => {
      mockDownloadImageAsObjectUrl.mockResolvedValue(null)

      const { getImageUrl, cache } = useImageCache()
      const result = await getImageUrl('uuid-4')

      expect(result).toBeNull()
      expect(cache.value['uuid-4']).toBeUndefined()
    })

    it('clears loading state in finally block', async () => {
      mockDownloadImageAsObjectUrl.mockResolvedValue('blob:url')

      const { getImageUrl, isLoading } = useImageCache()

      // Check loading state
      expect(isLoading('uuid-5')).toBe(false)

      const promise = getImageUrl('uuid-5')
      // During download, isLoading should be true
      // (we can't easily check mid-promise, but we verify it's false after)
      await promise

      expect(isLoading('uuid-5')).toBe(false)
    })

    it('clears loading state even on error', async () => {
      mockDownloadImageAsObjectUrl.mockRejectedValue(new Error('fail'))

      const { getImageUrl, isLoading } = useImageCache()

      // Should not throw because downloadImageAsObjectUrl is called inside try
      // Actually looking at the source, there's no try/catch, so the error propagates
      await expect(getImageUrl('uuid-6')).rejects.toThrow('fail')

      // But finally still runs
      expect(isLoading('uuid-6')).toBe(false)
    })
  })

  describe('isLoading', () => {
    it('returns false for unknown uuid', () => {
      const { isLoading } = useImageCache()
      expect(isLoading('unknown')).toBe(false)
    })
  })
})
