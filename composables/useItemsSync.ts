import { decodeJwtPayloadFromToken } from '@ippoan/auth-client'
/**
 * マルチブラウザ同期 composable
 *
 * WebSocket (Durable Objects Hibernation API) + BroadcastChannel で
 * クロスデバイス/クロスタブのアイテム同期を実現
 *
 * 接続先: wss://sync.mtamaramu.com/ws/items/{orgId}?token=JWT
 */

export interface SyncMessage {
  type: 'items_changed'
  action: 'create' | 'update' | 'delete' | 'move'
  parentId: string
  ownerType: 'org' | 'personal'
  userId?: string
}

type SyncCallback = (msg: SyncMessage) => void

/** JWT payload から sub (user_id) を取得 */
function getUserIdFromToken(token: string): string | null {
  // decodeJwtPayloadFromToken はマルチバイト安全 + parse 失敗時 {} を返す
  const payload = decodeJwtPayloadFromToken(token)
  return (payload.sub as string) || null
}

export function useItemsSync() {
  const { token, orgId } = useAuth()
  const config = useRuntimeConfig()
  const syncUrl = config.public.syncUrl as string

  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const callbacks: SyncCallback[] = []
  let bc: BroadcastChannel | null = null

  function initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined' || !orgId.value) return
    bc = new BroadcastChannel(`items-sync-${orgId.value}`)
    bc.onmessage = (event: MessageEvent) => {
      const msg = event.data as SyncMessage
      if (msg.type === 'items_changed') {
        callbacks.forEach(cb => cb(msg))
      }
    }
  }

  function connect() {
    if (!syncUrl || !token.value || !orgId.value) return
    if (ws && ws.readyState <= WebSocket.OPEN) return

    const url = `${syncUrl}/ws/items/${orgId.value}?token=${encodeURIComponent(token.value)}`
    const socket = new WebSocket(url)

    socket.onopen = () => {
      connected.value = true
      reconnectAttempts = 0
    }

    socket.onmessage = (event: MessageEvent) => {
      if (event.data === 'pong') return // auto-response heartbeat

      try {
        const msg = JSON.parse(event.data) as SyncMessage
        if (msg.type === 'items_changed') {
          callbacks.forEach(cb => cb(msg))
          // 他タブにもBroadcastChannel経由で通知（WS経由の通知を中継）
          bc?.postMessage(msg)
        }
      } catch { /* ignore */ }
    }

    socket.onclose = () => {
      connected.value = false
      ws = null
      scheduleReconnect()
    }

    socket.onerror = () => {
      // onclose が onerror の後に発火する
    }

    ws = socket
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    if (typeof document !== 'undefined' && document.hidden) return

    // Exponential backoff with jitter: min(1000 * 2^n + jitter, 30000)
    const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
    const jitter = Math.random() * 1000
    const delay = baseDelay + jitter

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectAttempts++
      connect()
    }, delay)
  }

  function onVisibilityChange() {
    if (document.hidden) {
      // 非表示: 再接続タイマーを停止（既存接続は維持）
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    } else {
      // 表示復帰: 切断されていたら再接続
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnectAttempts = 0
        connect()
      }
    }
  }

  /** CRUD成功後に他クライアントへ通知 */
  function notifyChange(action: string, parentId: string, ownerType: string) {
    const msg: SyncMessage = {
      type: 'items_changed',
      action: action as SyncMessage['action'],
      parentId,
      ownerType: ownerType as 'org' | 'personal',
    }

    // WebSocketで他デバイスへ
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }

    // BroadcastChannelで同一ブラウザの他タブへ（即時、サーバー不要）
    bc?.postMessage(msg)
  }

  /** 同期メッセージ受信時のコールバック登録 */
  function onSync(cb: SyncCallback) {
    callbacks.push(cb)
  }

  /** 同期開始 */
  function start() {
    if (typeof window === 'undefined') return
    initBroadcastChannel()
    document.addEventListener('visibilitychange', onVisibilityChange)
    connect()
  }

  /** 同期停止・クリーンアップ */
  function stop() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    bc?.close()
    bc = null
    ws?.close(1000, 'Client disconnecting')
    ws = null
    connected.value = false
  }

  return {
    connected: readonly(connected),
    userId: computed(() => token.value ? getUserIdFromToken(token.value) : null),
    start,
    stop,
    notifyChange,
    onSync,
  }
}
