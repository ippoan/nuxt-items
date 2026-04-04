import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGrpc = {
  items: {},
  files: {
    createFile: vi.fn(),
    downloadFile: vi.fn(),
  },
}

vi.stubGlobal('useNuxtApp', () => ({ $grpc: mockGrpc }))

const { useFileUpload } = await import('../../composables/useFileUpload')

function setupImageMock(opts: { width: number; height: number; shouldError?: boolean }) {
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toBlob: vi.fn((cb: any) => cb(new Blob(['data']))),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(4))

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
  describe('resizeImage', () => {
    it('resizes image when width > maxWidth', async () => {
      const mockCanvas = setupImageMock({ width: 2400, height: 1600 })
      mockGrpc.files.createFile.mockResolvedValue({ file: { uuid: 'uuid-1' } })

      const { uploadImage } = useFileUpload()
      const uuid = await uploadImage(new File(['test'], 'photo.jpg'))

      expect(uuid).toBe('uuid-1')
      expect(mockCanvas.width).toBe(1200)
      expect(mockCanvas.height).toBe(800)
    })

    it('does not resize when width <= maxWidth', async () => {
      const mockCanvas = setupImageMock({ width: 800, height: 600 })
      mockGrpc.files.createFile.mockResolvedValue({ file: { uuid: 'uuid-2' } })

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

    it('rejects when arrayBuffer fails', async () => {
      setupImageMock({ width: 100, height: 100 })
      vi.spyOn(Blob.prototype, 'arrayBuffer').mockRejectedValue(new Error('ab fail'))

      const { uploadImage } = useFileUpload()
      await expect(uploadImage(new File(['test'], 'ab-fail.jpg'))).rejects.toThrow('ab fail')
    })
  })

  describe('uploadImage', () => {
    it('returns empty string when createFile returns no uuid', async () => {
      setupImageMock({ width: 100, height: 100 })
      mockGrpc.files.createFile.mockResolvedValue({})

      const { uploadImage } = useFileUpload()
      const uuid = await uploadImage(new File(['test'], 'nofile.jpg'))
      expect(uuid).toBe('')
    })

    it('uses file.name for filename', async () => {
      setupImageMock({ width: 100, height: 100 })
      mockGrpc.files.createFile.mockResolvedValue({ file: { uuid: 'u' } })

      const { uploadImage } = useFileUpload()
      await uploadImage(new File(['test'], 'myphoto.jpg'))

      expect(mockGrpc.files.createFile).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'myphoto.jpg' }),
      )
    })

    it('uses fallback filename when file.name is empty', async () => {
      setupImageMock({ width: 100, height: 100 })
      mockGrpc.files.createFile.mockResolvedValue({ file: { uuid: 'u' } })

      const { uploadImage } = useFileUpload()
      const file = new File(['test'], '')
      await uploadImage(file)

      expect(mockGrpc.files.createFile).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'image.jpg' }),
      )
    })
  })

  describe('downloadImageAsObjectUrl', () => {
    it('downloads and creates object URL', async () => {
      mockGrpc.files.downloadFile.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { data: new Uint8Array([1, 2, 3]) }
          yield { data: new Uint8Array([4, 5, 6]) }
        },
      })
      vi.stubGlobal('URL', {
        ...globalThis.URL,
        createObjectURL: vi.fn(() => 'blob:result'),
        revokeObjectURL: vi.fn(),
      })

      const { downloadImageAsObjectUrl } = useFileUpload()
      const url = await downloadImageAsObjectUrl('file-uuid')
      expect(url).toBe('blob:result')
    })

    it('returns null when no chunks received', async () => {
      mockGrpc.files.downloadFile.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {},
      })

      const { downloadImageAsObjectUrl } = useFileUpload()
      expect(await downloadImageAsObjectUrl('empty')).toBeNull()
    })

    it('returns null on error', async () => {
      mockGrpc.files.downloadFile.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          throw new Error('fail')
        },
      })

      const { downloadImageAsObjectUrl } = useFileUpload()
      expect(await downloadImageAsObjectUrl('bad')).toBeNull()
    })
  })
})
