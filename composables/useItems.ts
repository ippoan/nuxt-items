import type { Item } from '@yhonda-ohishi-pub-dev/logi-proto'
import type { SyncMessage } from './useItemsSync'

export type OwnerType = 'org' | 'personal' | ''

export interface BreadcrumbItem {
  id: string
  name: string
}

export function useItems() {
  const { $grpc } = useNuxtApp()
  const sync = useItemsSync()

  const items = ref<Item[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<string>('')

  // ナビゲーション状態
  const currentParentId = ref('')
  const ownerType = ref<OwnerType>('org')
  const breadcrumbs = ref<BreadcrumbItem[]>([])

  async function fetchItems() {
    status.value = 'pending'
    error.value = ''
    try {
      const response = await $grpc.items.listItems({
        parentId: currentParentId.value,
        ownerType: ownerType.value,
        category: '',
      })
      items.value = response.items
      status.value = 'success'
    } catch (e: any) {
      error.value = e.message || 'エラーが発生しました'
      status.value = 'error'
    }
  }

  async function createItem(data: {
    name: string
    parentId?: string
    ownerType?: string
    barcode?: string
    category?: string
    description?: string
    imageUrl?: string
    url?: string
    quantity?: number
    itemType?: string
  }) {
    const effectiveParentId = data.parentId ?? currentParentId.value
    const effectiveOwnerType = data.ownerType ?? (ownerType.value || 'org')
    await $grpc.items.createItem({
      parentId: effectiveParentId,
      ownerType: effectiveOwnerType,
      name: data.name,
      barcode: data.barcode ?? '',
      category: data.category ?? '',
      description: data.description ?? '',
      imageUrl: data.imageUrl ?? '',
      url: data.url ?? '',
      quantity: data.quantity ?? 1,
      itemType: data.itemType ?? 'item',
    })
    await fetchItems()
    sync.notifyChange('create', effectiveParentId, effectiveOwnerType)
  }

  async function updateItem(id: string, data: {
    name: string
    barcode?: string
    category?: string
    description?: string
    imageUrl?: string
    url?: string
    quantity?: number
  }) {
    await $grpc.items.updateItem({
      id,
      name: data.name,
      barcode: data.barcode ?? '',
      category: data.category ?? '',
      description: data.description ?? '',
      imageUrl: data.imageUrl ?? '',
      url: data.url ?? '',
      quantity: data.quantity ?? 1,
    })
    await fetchItems()
    sync.notifyChange('update', currentParentId.value, ownerType.value)
  }

  async function deleteItem(id: string) {
    await $grpc.items.deleteItem({ id })
    items.value = items.value.filter(item => item.id !== id)
    sync.notifyChange('delete', currentParentId.value, ownerType.value)
  }

  async function moveItem(id: string, newParentId: string) {
    await $grpc.items.moveItem({ id, newParentId })
    await fetchItems()
    sync.notifyChange('move', currentParentId.value, ownerType.value)
  }

  async function changeOwnership(id: string, newOwnerType: string) {
    console.log('[changeOwnership] calling RPC:', { id, newOwnerType })
    await $grpc.items.changeItemOwnership({ id, newOwnerType })
    console.log('[changeOwnership] RPC success, fetching items')
    await fetchItems()
    sync.notifyChange('ownership', currentParentId.value, ownerType.value)
  }

  async function convertItemType(id: string, newItemType: string) {
    const response = await $grpc.items.convertItemType({ id, newItemType })
    await fetchItems()
    sync.notifyChange('update', currentParentId.value, ownerType.value)
    return response
  }

  async function searchByBarcode(barcode: string): Promise<Item[]> {
    const response = await $grpc.items.searchByBarcode({ barcode })
    return response.items
  }

  async function getItem(id: string): Promise<Item | null> {
    try {
      const response = await $grpc.items.getItem({ id })
      return response.item ?? null
    } catch {
      return null
    }
  }

  // 階層ナビゲーション
  function navigateToChild(item: Item) {
    breadcrumbs.value = [...breadcrumbs.value, { id: item.id, name: item.name }]
    currentParentId.value = item.id
    fetchItems()
  }

  function navigateToRoot() {
    breadcrumbs.value = []
    currentParentId.value = ''
    fetchItems()
  }

  function navigateToBreadcrumb(index: number) {
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
    currentParentId.value = breadcrumbs.value[index]?.id ?? ''
    fetchItems()
  }

  function setOwnerType(type: OwnerType) {
    ownerType.value = type
    fetchItems()
  }

  /** WebSocket同期を開始し、受信時の自動リフレッシュを設定 */
  function initSync() {
    const myUserId = sync.userId.value

    sync.onSync((msg: SyncMessage) => {
      // personalアイテム: 自分以外のユーザーの変更は無視
      if (msg.ownerType === 'personal' && msg.userId && msg.userId !== myUserId) return

      // 現在表示中のフォルダ+ownerTypeが一致する場合、即座にリフレッシュ
      if (msg.parentId === currentParentId.value && msg.ownerType === ownerType.value) {
        fetchItems()
      }
      // 別フォルダの変更は現時点では無視（ナビゲーション時に常にfetchするため）
    })

    sync.start()
  }

  return {
    items: readonly(items),
    status: readonly(status),
    error: readonly(error),
    currentParentId: readonly(currentParentId),
    ownerType,
    breadcrumbs: readonly(breadcrumbs),
    syncConnected: sync.connected,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    moveItem,
    changeOwnership,
    convertItemType,
    searchByBarcode,
    getItem,
    navigateToChild,
    navigateToRoot,
    navigateToBreadcrumb,
    setOwnerType,
    initSync,
  }
}
