import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUploadFile = vi.fn()
const mockDownloadFile = vi.fn()
vi.mock('~/utils/api', () => ({
  uploadFile: mockUploadFile,
  downloadFile: mockDownloadFile,
}))

const { useFileUpload } = await import('../../composables/useFileUpload')

function setupImageMock(opts: { width: number; height: number; shouldError?: boolean }) {
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toBlob: vi.fn((cb: any) => cb(new Blob(['data']))),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })

  class MockImage {
    width = opts.width
    height = opts.height
    src = ''
    onload: any = null
    onerror: any = null
    constructor() {
      setTimeout(() => {
        if (opts.shouldError) this.onerror?.()
        else this.onload?.()
      }, 0)
    }
  }
  vi.stubGlobal('Image', MockImage)

  return mockCanvas
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFileUpload', () => {
  describe('resizeImage (via uploadImage)', () => {
    it('resizes image when width > maxWidth', async () => {
      const mockCanvas = setupImageMock({ width: 2400, height: 1600 })
      mockUploadFile.mockResolvedValue({ id: 'uuid-1' })

      const { uploadImage } = useFileUpload()
      const uuid = await uploadImage(new File(['test'], 'photo.jpg'))

      expect(uuid).toBe('uuid-1')
      expect(mockCanvas.width).toBe(1200)
      expect(mockCanvas.height).toBe(800)
    })

    it('does not resize when width <= maxWidth', async () => {
      const mockCanvas = setupImageMock({ width: 800, height: 600 })
      mockUploadFile.mockResolvedValue({ id: 'uuid-2' })

      const { uploadImage } = useFileUpload()
      await uploadImage(new File(['test'], 'small.jpg'))

      expect(mockCanvas.width).toBe(800)
      expect(mockCanvas.height).toBe(600)
    })

    it('rejects when image fails to load', async () => {
      setupImageMock({ width: 0, height: 0, shouldError: true })

      const { uploadImage } = useFileUpload()
      await expect(uploadImage(new File(['test'], 'bad.jpg'))).rejects.toThrow('画像の読み込みに失敗しました')
    })

    it('rejects when toBlob returns null', async () => {
      const mockCanvas = setupImageMock({ width: 100, height: 100 })
      mockCanvas.toBlob.mockImplementation((cb: any) => cb(null))

      const { uploadImage } = useFileUpload()
      await expect(uploadImage(new File(['test'], 'null-blob.jpg'))).rejects.toThrow('リサイズに失敗しました')
    })
  })

  describe('uploadImage', () => {
    it('returns empty string when uploadFile returns no id', async () => {
      setupImageMock({ width: 100, height: 100 })
      mockUploadFile.mockResolvedValue({})

      const { uploadImage } = useFileUpload()
      const uuid = await uploadImage(new File(['test'], 'nofile.jpg'))
      expect(uuid).toBe('')
    })

    it('calls uploadFile with file and resized blob', async () => {
      setupImageMock({ width: 100, height: 100 })
      mockUploadFile.mockResolvedValue({ id: 'u' })

      const { uploadImage } = useFileUpload()
      const file = new File(['test'], 'myphoto.jpg')
      await uploadImage(file)

      expect(mockUploadFile).toHaveBeenCalledWith(file, expect.any(Blob))
    })
  })

  describe('downloadImageAsObjectUrl', () => {
    it('downloads and creates object URL', async () => {
      mockDownloadFile.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]))
      vi.stubGlobal('URL', {
        ...globalThis.URL,
        createObjectURL: vi.fn(() => 'blob:result'),
        revokeObjectURL: vi.fn(),
      })

      const { downloadImageAsObjectUrl } = useFileUpload()
      const url = await downloadImageAsObjectUrl('file-uuid')
      expect(url).toBe('blob:result')
    })

    it('returns null when blob is empty', async () => {
      mockDownloadFile.mockResolvedValue(new Blob([]))

      const { downloadImageAsObjectUrl } = useFileUpload()
      expect(await downloadImageAsObjectUrl('empty')).toBeNull()
    })

    it('returns null on error', async () => {
      mockDownloadFile.mockRejectedValue(new Error('fail'))

      const { downloadImageAsObjectUrl } = useFileUpload()
      expect(await downloadImageAsObjectUrl('bad')).toBeNull()
    })
  })
})
