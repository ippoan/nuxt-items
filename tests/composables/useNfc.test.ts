import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('ref', ref)
vi.stubGlobal('onMounted', (fn: Function) => fn())
let onUnmountedCallbacks: Function[] = []
vi.stubGlobal('onUnmounted', (fn: Function) => { onUnmountedCallbacks.push(fn) })

// Mock NDEFReader
class MockNDEFReader {
  onreading: ((event: any) => void) | null = null
  onreadingerror: ((event: any) => void) | null = null
  scan = vi.fn().mockResolvedValue(undefined)
  write = vi.fn().mockResolvedValue(undefined)
}

let mockNdefInstances: MockNDEFReader[] = []

beforeEach(() => {
  mockNdefInstances = []
  onUnmountedCallbacks = []
  const OrigMock = MockNDEFReader
  vi.stubGlobal('NDEFReader', class extends OrigMock {
    constructor() {
      super()
      mockNdefInstances.push(this)
    }
  })
  // Simulate browser with NFC support
  // window is already defined in happy-dom
})

afterEach(() => {
  vi.restoreAllMocks()
})

const { useNfc } = await import('../../composables/useNfc')

describe('parseNdefMessage (tested via startScan)', () => {
  it('parses URL record matching items domain', async () => {
    const { startScan, isScanning } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    expect(isScanning.value).toBe(true)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const urlBytes = encoder.encode('https://items.mtamaramu.com/?nfc=item-123')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'url',
          data: new DataView(urlBytes.buffer),
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({
      type: 'item',
      itemId: 'item-123',
      url: 'https://items.mtamaramu.com/?nfc=item-123',
    })
  })

  it('parses URL record not matching items domain', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const urlBytes = encoder.encode('https://other.example.com/page')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'url',
          data: new DataView(urlBytes.buffer),
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({
      type: 'url',
      url: 'https://other.example.com/page',
    })
  })

  it('parses text record with UUID format', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const uuid = '12345678-1234-1234-1234-123456789abc'
    const textBytes = encoder.encode(uuid)

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'text',
          data: new DataView(textBytes.buffer),
          encoding: 'utf-8',
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({
      type: 'item',
      itemId: uuid,
      text: uuid,
    })
  })

  it('parses text record with non-UUID text', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const textBytes = encoder.encode('hello world')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'text',
          data: new DataView(textBytes.buffer),
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({
      type: 'text',
      text: 'hello world',
    })
  })

  it('returns unknown for empty records', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    ndefReader.onreading?.({
      message: { records: [] },
    })

    expect(onRead).toHaveBeenCalledWith({ type: 'unknown' })
  })

  it('returns unknown for unrecognized record types', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'mime',
          data: new DataView(new ArrayBuffer(0)),
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({ type: 'unknown' })
  })

  it('skips url record with no data', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    ndefReader.onreading?.({
      message: {
        records: [
          { recordType: 'url', data: undefined },
          { recordType: 'text', data: undefined },
        ],
      },
    })

    expect(onRead).toHaveBeenCalledWith({ type: 'unknown' })
  })
})

describe('extractItemIdFromUrl (tested via parseNdefMessage)', () => {
  it('extracts nfc param from items domain', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const urlBytes = encoder.encode('https://items.mtamaramu.com/?nfc=abc-def')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'url',
          data: new DataView(urlBytes.buffer),
        }],
      },
    })

    expect(onRead).toHaveBeenCalledWith({
      type: 'item',
      itemId: 'abc-def',
      url: 'https://items.mtamaramu.com/?nfc=abc-def',
    })
  })

  it('returns null for items domain without nfc param', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const urlBytes = encoder.encode('https://items.mtamaramu.com/?other=123')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'url',
          data: new DataView(urlBytes.buffer),
        }],
      },
    })

    // No nfc param → extractItemIdFromUrl returns null → type: 'url'
    expect(onRead).toHaveBeenCalledWith({
      type: 'url',
      url: 'https://items.mtamaramu.com/?other=123',
    })
  })

  it('handles invalid URL gracefully', async () => {
    const { startScan } = useNfc()
    const onRead = vi.fn()
    await startScan(onRead)

    const ndefReader = mockNdefInstances[0]
    const encoder = new TextEncoder()
    const urlBytes = encoder.encode('not-a-valid-url')

    ndefReader.onreading?.({
      message: {
        records: [{
          recordType: 'url',
          data: new DataView(urlBytes.buffer),
        }],
      },
    })

    // extractItemIdFromUrl catches URL parse error → returns null → type: 'url'
    expect(onRead).toHaveBeenCalledWith({
      type: 'url',
      url: 'not-a-valid-url',
    })
  })
})

describe('useNfc', () => {
  describe('isSupported', () => {
    it('is true when NDEFReader is available', () => {
      const { isSupported } = useNfc()
      expect(isSupported.value).toBe(true)
    })

    it('is false when NDEFReader is not available', () => {
      const saved = globalThis.NDEFReader
      // @ts-ignore
      delete globalThis.NDEFReader

      const { isSupported } = useNfc()
      expect(isSupported.value).toBe(false)

      // @ts-ignore
      globalThis.NDEFReader = saved
    })
  })

  describe('startScan', () => {
    it('sets error when not supported', async () => {
      const saved = globalThis.NDEFReader
      // @ts-ignore
      delete globalThis.NDEFReader

      const { startScan, error, isSupported } = useNfc()
      // isSupported is false because onMounted ran with no NDEFReader
      await startScan(vi.fn())

      expect(error.value).toBe('このデバイスはNFCに対応していません')

      // @ts-ignore
      globalThis.NDEFReader = saved
    })

    it('sets onreadingerror handler', async () => {
      const { startScan, error } = useNfc()
      await startScan(vi.fn())

      const ndefReader = mockNdefInstances[0]
      ndefReader.onreadingerror?.({} as Event)

      expect(error.value).toBe('NFCタグのデータを読み取れませんでした')
    })

    it('handles AbortError silently on scan', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn().mockRejectedValue(abortError)
        write = vi.fn()
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { startScan, error, isScanning } = useNfc()
      await startScan(vi.fn())

      // AbortError: just returns, no error
      expect(error.value).toBeNull()
      // isScanning was not set to true because scan threw before it could be set
    })

    it('handles non-AbortError on scan', async () => {
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn().mockRejectedValue(new Error('Permission denied'))
        write = vi.fn()
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { startScan, error, isScanning } = useNfc()
      await startScan(vi.fn())

      expect(error.value).toBe('Permission denied')
      expect(isScanning.value).toBe(false)
    })

    it('handles scan error with empty message', async () => {
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn().mockRejectedValue(new Error(''))
        write = vi.fn()
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { startScan, error } = useNfc()
      await startScan(vi.fn())

      expect(error.value).toBe('NFCスキャンの開始に失敗しました')
    })
  })

  describe('writeItemUrl', () => {
    it('writes URL successfully', async () => {
      const { writeItemUrl, error } = useNfc()
      const result = await writeItemUrl('item-999')

      expect(result).toBe(true)
      expect(error.value).toBeNull()

      const writer = mockNdefInstances[0]
      expect(writer.write).toHaveBeenCalledWith({
        records: [{ recordType: 'url', data: 'https://items.mtamaramu.com/?nfc=item-999' }],
      })
    })

    it('returns false when not supported', async () => {
      const saved = globalThis.NDEFReader
      // @ts-ignore
      delete globalThis.NDEFReader

      const { writeItemUrl, error } = useNfc()
      const result = await writeItemUrl('item-999')

      expect(result).toBe(false)
      expect(error.value).toBe('このデバイスはNFCに対応していません')

      // @ts-ignore
      globalThis.NDEFReader = saved
    })

    it('handles AbortError on write', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn()
        write = vi.fn().mockRejectedValue(abortError)
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { writeItemUrl } = useNfc()
      const result = await writeItemUrl('item-999')

      expect(result).toBe(false)
    })

    it('handles non-AbortError on write', async () => {
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn()
        write = vi.fn().mockRejectedValue(new Error('Write failed'))
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { writeItemUrl, error } = useNfc()
      const result = await writeItemUrl('item-999')

      expect(result).toBe(false)
      expect(error.value).toBe('Write failed')
    })

    it('handles write error with empty message', async () => {
      vi.stubGlobal('NDEFReader', class {
        onreading = null
        onreadingerror = null
        scan = vi.fn()
        write = vi.fn().mockRejectedValue(new Error(''))
        constructor() { mockNdefInstances.push(this as any) }
      })

      const { writeItemUrl, error } = useNfc()
      const result = await writeItemUrl('item-999')

      expect(result).toBe(false)
      expect(error.value).toBe('NFCタグへの書き込みに失敗しました')
    })
  })

  describe('stopScan', () => {
    it('aborts and resets scanning state', async () => {
      const { startScan, stopScan, isScanning } = useNfc()
      await startScan(vi.fn())
      expect(isScanning.value).toBe(true)

      stopScan()
      expect(isScanning.value).toBe(false)
    })

    it('is safe to call when no scan is active', () => {
      const { stopScan } = useNfc()
      expect(() => stopScan()).not.toThrow()
    })
  })

  describe('onUnmounted', () => {
    it('calls stopScan on unmount', async () => {
      const { startScan, isScanning } = useNfc()
      await startScan(vi.fn())
      expect(isScanning.value).toBe(true)

      // Trigger all captured onUnmounted callbacks
      onUnmountedCallbacks.forEach(cb => cb())
      expect(isScanning.value).toBe(false)
    })
  })
})
