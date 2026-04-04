import type { Item } from '~/types/item'
import type { SyncMessage } from './useItemsSync'
import * as api from '~/utils/api'

export type OwnerType = 'org' | 'personal' | ''

export interface BreadcrumbItem {
  id: string
  name: string
}

export function useItems() {
  const sync = useItemsSync()

  const items = ref<Item[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<string>('')

  const currentParentId = ref('')
  const ownerType = ref<OwnerType>('org')
  const breadcrumbs = ref<BreadcrumbItem[]>([])

  async function fetchItems() {
    status.value = 'pending'
    error.value = ''
    try {
      items.value = await api.listItems(currentParentId.value || undefined, ownerType.value || 'org')
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
    await api.createItem({
      parentId: effectiveParentId || null,
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
    await api.updateItem(id, {
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
    await api.deleteItem(id)
    items.value = items.value.filter(item => item.id !== id)
    sync.notifyChange('delete', currentParentId.value, ownerType.value)
  }

  async function moveItem(id: string, newParentId: string) {
    await api.moveItem(id, newParentId || null)
    await fetchItems()
    sync.notifyChange('move', currentParentId.value, ownerType.value)
  }

  async function changeOwnership(id: string, newOwnerType: string) {
    await api.changeOwnership(id, newOwnerType)
    await fetchItems()
    sync.notifyChange('ownership', currentParentId.value, ownerType.value)
  }

  async function convertItemType(id: string, newItemType: string) {
    const response = await api.convertItemType(id, newItemType)
    await fetchItems()
    sync.notifyChange('update', currentParentId.value, ownerType.value)
    return { childrenMoved: response.childrenMoved }
  }

  async function searchByBarcode(barcode: string): Promise<Item[]> {
    return api.searchByBarcode(barcode)
  }

  async function getItem(id: string): Promise<Item | null> {
    try {
      return await api.getItem(id)
    } catch {
      return null
    }
  }

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

  function initSync() {
    const myUserId = sync.userId.value
    sync.onSync((msg: SyncMessage) => {
      if (msg.ownerType === 'personal' && msg.userId && msg.userId !== myUserId) return
      if (msg.parentId === currentParentId.value && msg.ownerType === ownerType.value) {
        fetchItems()
      }
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
    fetchItems, createItem, updateItem, deleteItem, moveItem,
    changeOwnership, convertItemType, searchByBarcode, getItem,
    navigateToChild, navigateToRoot, navigateToBreadcrumb, setOwnerType, initSync,
  }
}
