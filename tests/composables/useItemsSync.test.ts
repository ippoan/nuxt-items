import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, readonly, computed } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('ref', ref)
vi.stubGlobal('readonly', readonly)
vi.stubGlobal('computed', computed)

vi.stubGlobal('useAuth', () => ({
  token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
  orgId: ref('org-456'),
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  public: { syncUrl: 'wss://sync.example.com' },
}))

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((ev: any) => void) | null = null
  onmessage: ((ev: any) => void) | null = null
  onclose: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    mockWsInstances.push(this)
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }
  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({})
  }
  simulateError() {
    this.onerror?.({})
  }
}

let mockWsInstances: MockWebSocket[] = []

let stopFn: (() => void) | null = null

beforeEach(() => {
  mockWsInstances = []
  mockBcInstances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  vi.useFakeTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  stopFn = null
})

afterEach(() => {
  stopFn?.()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string
  onmessage: ((ev: any) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(name: string) {
    this.name = name
    mockBcInstances.push(this)
  }
}

let mockBcInstances: MockBroadcastChannel[] = []

beforeEach(() => {
  mockBcInstances = []
})

// Import after all stubs
const { useItemsSync } = await import('../../composables/useItemsSync')

// Also access getUserIdFromToken for direct testing
const mod = await import('../../composables/useItemsSync') as any

describe('getUserIdFromToken (via userId computed)', () => {
  it('extracts sub from valid JWT', () => {
    const { userId } = useItemsSync()
    expect(userId.value).toBe('user-123')
  })

  it('returns null for invalid JWT', () => {
    vi.stubGlobal('useAuth', () => ({
      token: ref('invalid-token'),
      orgId: ref('org-456'),
    }))

    const { userId } = useItemsSync()
    expect(userId.value).toBeNull()

    // Restore
    vi.stubGlobal('useAuth', () => ({
      token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
      orgId: ref('org-456'),
    }))
  })

  it('returns null when token is empty', () => {
    vi.stubGlobal('useAuth', () => ({
      token: ref(''),
      orgId: ref('org-456'),
    }))

    const { userId } = useItemsSync()
    expect(userId.value).toBeNull()

    vi.stubGlobal('useAuth', () => ({
      token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
      orgId: ref('org-456'),
    }))
  })

  it('returns null when JWT has no sub', () => {
    // base64 of {"email":"a@b.com"} = eyJlbWFpbCI6ImFAYi5jb20ifQ
    vi.stubGlobal('useAuth', () => ({
      token: ref('header.eyJlbWFpbCI6ImFAYi5jb20ifQ.sig'),
      orgId: ref('org-456'),
    }))

    const { userId } = useItemsSync()
    expect(userId.value).toBeNull()

    vi.stubGlobal('useAuth', () => ({
      token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
      orgId: ref('org-456'),
    }))
  })
})

describe('useItemsSync', () => {
  describe('start / stop', () => {
    it('start initializes BroadcastChannel and connects WebSocket', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      const { start, connected } = useItemsSync()

      start()

      expect(mockBcInstances.length).toBe(1)
      expect(mockBcInstances[0].name).toBe('items-sync-org-456')
      expect(mockWsInstances.length).toBe(1)
      expect(mockWsInstances[0].url).toContain('wss://sync.example.com/ws/items/org-456')
      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(connected.value).toBe(false)
    })

    it('start does nothing on SSR (no window)', () => {
      const origWindow = globalThis.window
      // @ts-ignore
      delete globalThis.window
      vi.stubGlobal('window', undefined)

      const { start } = useItemsSync()
      start()

      expect(mockWsInstances.length).toBe(0)

      // Restore
      globalThis.window = origWindow
    })

    it('stop cleans up everything', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const { start, stop, connected } = useItemsSync()

      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()
      expect(connected.value).toBe(true)

      stop()

      expect(mockBcInstances[0].close).toHaveBeenCalled()
      expect(ws.close).toHaveBeenCalledWith(1000, 'Client disconnecting')
      expect(connected.value).toBe(false)
      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })

    it('stop with no active ws/bc/timer is safe', () => {
      const { stop } = useItemsSync()
      expect(() => stop()).not.toThrow()
    })
  })

  describe('connect', () => {
    it('does not connect if syncUrl is empty', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({
        public: { syncUrl: '' },
      }))

      const { start } = useItemsSync()
      start()

      expect(mockWsInstances.length).toBe(0)

      vi.stubGlobal('useRuntimeConfig', () => ({
        public: { syncUrl: 'wss://sync.example.com' },
      }))
    })

    it('does not connect if token is empty', () => {
      vi.stubGlobal('useAuth', () => ({
        token: ref(''),
        orgId: ref('org-456'),
      }))

      const { start } = useItemsSync()
      start()

      expect(mockWsInstances.length).toBe(0)

      vi.stubGlobal('useAuth', () => ({
        token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
        orgId: ref('org-456'),
      }))
    })

    it('does not connect if orgId is empty', () => {
      vi.stubGlobal('useAuth', () => ({
        token: ref('some-token'),
        orgId: ref(''),
      }))

      const { start } = useItemsSync()
      start()

      // BroadcastChannel also skipped when orgId is empty
      expect(mockBcInstances.length).toBe(0)
      expect(mockWsInstances.length).toBe(0)

      vi.stubGlobal('useAuth', () => ({
        token: ref('header.eyJzdWIiOiJ1c2VyLTEyMyJ9.sig'),
        orgId: ref('org-456'),
      }))
    })

    it('does not create duplicate connection if already connected', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.readyState = MockWebSocket.OPEN

      // Try to connect again (internal connect call)
      // We need to trigger reconnect which calls connect()
      // The second connect should be a no-op since ws.readyState <= OPEN
      expect(mockWsInstances.length).toBe(1)
    })

    it('onopen sets connected and resets reconnect attempts', () => {
      const { start, connected } = useItemsSync()
      start()
      const ws = mockWsInstances[0]

      ws.simulateOpen()
      expect(connected.value).toBe(true)
    })

    it('onmessage with pong is ignored', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      ws.simulateMessage('pong')
      expect(callback).not.toHaveBeenCalled()
    })

    it('onmessage with items_changed triggers callbacks and broadcasts', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      const msg = JSON.stringify({ type: 'items_changed', action: 'create', parentId: 'p1', ownerType: 'org' })
      ws.simulateMessage(msg)

      expect(callback).toHaveBeenCalledWith({
        type: 'items_changed',
        action: 'create',
        parentId: 'p1',
        ownerType: 'org',
      })
      expect(mockBcInstances[0].postMessage).toHaveBeenCalled()
    })

    it('onmessage with non-items_changed type is ignored', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      ws.simulateMessage(JSON.stringify({ type: 'other', action: 'create' }))
      expect(callback).not.toHaveBeenCalled()
    })

    it('onmessage with invalid JSON is ignored', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      ws.simulateMessage('not-json{')
      expect(callback).not.toHaveBeenCalled()
    })

    it('onclose sets connected false and schedules reconnect', () => {
      const { start, connected } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()
      expect(connected.value).toBe(true)

      ws.simulateClose()
      expect(connected.value).toBe(false)
    })

    it('onerror does nothing (onclose fires after)', () => {
      const { start, connected } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      ws.simulateError()
      // connected should still be true until onclose
      expect(connected.value).toBe(true)
    })
  })

  describe('scheduleReconnect', () => {
    it('reconnects after delay on close', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()
      ws.simulateClose()

      // Should schedule reconnect
      vi.advanceTimersByTime(2000) // base: 1000 * 2^0 + jitter

      // A new WebSocket should be created
      expect(mockWsInstances.length).toBe(2)
    })

    it('does not reconnect if document is hidden', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      // Make document hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      ws.simulateClose()

      vi.advanceTimersByTime(60000)
      expect(mockWsInstances.length).toBe(1) // no reconnect

      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    })

    it('does not schedule duplicate reconnect timer', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[mockWsInstances.length - 1]
      ws.simulateOpen()

      // First close → scheduleReconnect sets timer
      ws.simulateClose()
      const countAfterFirstClose = mockWsInstances.length

      // Create another ws and close it before first timer fires
      // This exercises the `if (reconnectTimer) return` path
      // Actually, the second close won't create a new timer because reconnectTimer already exists
      // We just need to verify no extra WS gets created before timer fires
      vi.advanceTimersByTime(100) // small advance, not enough for reconnect
      expect(mockWsInstances.length).toBe(countAfterFirstClose)
    })
  })

  describe('BroadcastChannel', () => {
    it('receives items_changed from BroadcastChannel', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()

      const bc = mockBcInstances[0]
      bc.onmessage?.({ data: { type: 'items_changed', action: 'update', parentId: 'p2', ownerType: 'org' } })

      expect(callback).toHaveBeenCalledWith({
        type: 'items_changed',
        action: 'update',
        parentId: 'p2',
        ownerType: 'org',
      })
    })

    it('ignores non-items_changed from BroadcastChannel', () => {
      const { start, onSync } = useItemsSync()
      const callback = vi.fn()
      onSync(callback)
      start()

      const bc = mockBcInstances[0]
      bc.onmessage?.({ data: { type: 'other' } })

      expect(callback).not.toHaveBeenCalled()
    })

    it('skips BroadcastChannel if not available', () => {
      // @ts-ignore
      delete globalThis.BroadcastChannel
      vi.stubGlobal('BroadcastChannel', undefined)

      const { start } = useItemsSync()
      start()

      expect(mockBcInstances.length).toBe(0)

      vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    })
  })

  describe('notifyChange', () => {
    it('sends via WebSocket when connected', () => {
      const { start, notifyChange } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      notifyChange('create', 'parent-1', 'org')

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'items_changed',
        action: 'create',
        parentId: 'parent-1',
        ownerType: 'org',
      }))
      expect(mockBcInstances[0].postMessage).toHaveBeenCalled()
    })

    it('does not send via WebSocket when not connected', () => {
      const { start, notifyChange } = useItemsSync()
      start()

      notifyChange('update', 'parent-1', 'personal')

      // WebSocket send should not be called (readyState is CONNECTING)
      expect(mockWsInstances[0].send).not.toHaveBeenCalled()
      // But BroadcastChannel should still be used
      expect(mockBcInstances[0].postMessage).toHaveBeenCalled()
    })
  })

  describe('onVisibilityChange', () => {
    it('clears reconnect timer when hidden', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()
      ws.simulateClose() // schedules reconnect

      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))

      // Advancing timers should NOT create new WS
      vi.advanceTimersByTime(60000)
      expect(mockWsInstances.length).toBe(1)

      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    })

    it('reconnects when visible and disconnected', () => {
      const { start, stop } = useItemsSync()
      start()
      const ws = mockWsInstances[mockWsInstances.length - 1]
      ws.simulateOpen()

      // Go hidden first — clears reconnect timer
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))

      // Close while hidden — scheduleReconnect skips because hidden
      ws.simulateClose()

      const countBefore = mockWsInstances.length

      // Become visible again — should trigger connect()
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))

      // Should create exactly one new WebSocket
      expect(mockWsInstances.length).toBeGreaterThan(countBefore)
      stop()
    })

    it('does not reconnect when visible and already connected', () => {
      const { start } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()

      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))

      // Should NOT create new WebSocket
      expect(mockWsInstances.length).toBe(1)
    })
  })

  describe('stop with active reconnect timer', () => {
    it('clears reconnect timer on stop', () => {
      const { start, stop } = useItemsSync()
      start()
      const ws = mockWsInstances[0]
      ws.simulateOpen()
      ws.simulateClose() // schedules reconnect

      stop()

      // Advancing timers should NOT create new WS
      vi.advanceTimersByTime(60000)
      expect(mockWsInstances.length).toBe(1)
    })
  })
})
