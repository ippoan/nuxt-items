import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, readonly, computed } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('ref', ref)
vi.stubGlobal('readonly', readonly)
vi.stubGlobal('computed', computed)

const mockSync = {
  connected: ref(false),
  userId: computed(() => 'user-123'),
  start: vi.fn(),
  stop: vi.fn(),
  notifyChange: vi.fn(),
  onSync: vi.fn(),
}

vi.stubGlobal('useItemsSync', () => mockSync)

// Mock api module
const mockApi = {
  listItems: vi.fn(),
  getItem: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  moveItem: vi.fn(),
  changeOwnership: vi.fn(),
  convertItemType: vi.fn(),
  searchByBarcode: vi.fn(),
}
vi.mock('~/utils/api', () => mockApi)

const { useItems } = await import('../../composables/useItems')

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listItems.mockResolvedValue([])
})

describe('useItems', () => {
  describe('fetchItems', () => {
    it('fetches items and sets success status', async () => {
      const mockItems = [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }]
      mockApi.listItems.mockResolvedValue(mockItems)

      const { fetchItems, items, status, error } = useItems()
      await fetchItems()

      expect(status.value).toBe('success')
      expect(items.value).toEqual(mockItems)
      expect(error.value).toBe('')
      expect(mockApi.listItems).toHaveBeenCalledWith(undefined, 'org')
    })

    it('handles error on fetchItems', async () => {
      mockApi.listItems.mockRejectedValue(new Error('Network error'))

      const { fetchItems, status, error } = useItems()
      await fetchItems()

      expect(status.value).toBe('error')
      expect(error.value).toBe('Network error')
    })

    it('handles error with empty message', async () => {
      mockApi.listItems.mockRejectedValue(new Error(''))

      const { fetchItems, error } = useItems()
      await fetchItems()

      expect(error.value).toBe('エラーが発生しました')
    })
  })

  describe('createItem', () => {
    it('creates item with defaults', async () => {
      mockApi.createItem.mockResolvedValue({})

      const { createItem } = useItems()
      await createItem({ name: 'New Item' })

      expect(mockApi.createItem).toHaveBeenCalledWith({
        parentId: null,
        ownerType: 'org',
        name: 'New Item',
        barcode: '',
        category: '',
        description: '',
        imageUrl: '',
        url: '',
        quantity: 1,
        itemType: 'item',
      })
      expect(mockSync.notifyChange).toHaveBeenCalledWith('create', '', 'org')
    })

    it('creates item with all fields', async () => {
      mockApi.createItem.mockResolvedValue({})

      const { createItem } = useItems()
      await createItem({
        name: 'Full Item',
        parentId: 'p1',
        ownerType: 'personal',
        barcode: '123',
        category: 'Cat',
        description: 'Desc',
        imageUrl: 'img.jpg',
        url: 'https://example.com',
        quantity: 5,
        itemType: 'box',
      })

      expect(mockApi.createItem).toHaveBeenCalledWith({
        parentId: 'p1',
        ownerType: 'personal',
        name: 'Full Item',
        barcode: '123',
        category: 'Cat',
        description: 'Desc',
        imageUrl: 'img.jpg',
        url: 'https://example.com',
        quantity: 5,
        itemType: 'box',
      })
      expect(mockSync.notifyChange).toHaveBeenCalledWith('create', 'p1', 'personal')
    })

    it('uses currentParentId/ownerType as fallback when not provided', async () => {
      mockApi.createItem.mockResolvedValue({})

      const { createItem, navigateToChild } = useItems()
      // Navigate to set currentParentId
      navigateToChild({ id: 'folder-1', name: 'Folder' } as any)

      await createItem({ name: 'Sub Item' })

      expect(mockApi.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'folder-1',
          ownerType: 'org',
        }),
      )
    })

    it('uses empty ownerType fallback to "org"', async () => {
      mockApi.createItem.mockResolvedValue({})

      const { createItem, setOwnerType } = useItems()
      // ownerType is '' => falls back to 'org'
      setOwnerType('')
      await createItem({ name: 'Item' })

      expect(mockApi.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ ownerType: 'org' }),
      )
    })
  })

  describe('updateItem', () => {
    it('updates item with all fields', async () => {
      mockApi.updateItem.mockResolvedValue({})

      const { updateItem } = useItems()
      await updateItem('id-1', {
        name: 'Updated',
        barcode: '456',
        category: 'Cat2',
        description: 'NewDesc',
        imageUrl: 'new.jpg',
        url: 'https://new.com',
        quantity: 3,
      })

      expect(mockApi.updateItem).toHaveBeenCalledWith('id-1', {
        name: 'Updated',
        barcode: '456',
        category: 'Cat2',
        description: 'NewDesc',
        imageUrl: 'new.jpg',
        url: 'https://new.com',
        quantity: 3,
      })
      expect(mockSync.notifyChange).toHaveBeenCalledWith('update', '', 'org')
    })

    it('updates item with defaults', async () => {
      mockApi.updateItem.mockResolvedValue({})

      const { updateItem } = useItems()
      await updateItem('id-1', { name: 'Just name' })

      expect(mockApi.updateItem).toHaveBeenCalledWith('id-1', {
        name: 'Just name',
        barcode: '',
        category: '',
        description: '',
        imageUrl: '',
        url: '',
        quantity: 1,
      })
    })
  })

  describe('deleteItem', () => {
    it('deletes item and removes from local list', async () => {
      mockApi.deleteItem.mockResolvedValue(undefined)
      mockApi.listItems.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }])

      const { fetchItems, deleteItem, items } = useItems()
      await fetchItems()
      expect(items.value.length).toBe(2)

      await deleteItem('1')

      expect(items.value.length).toBe(1)
      expect(items.value[0].id).toBe('2')
      expect(mockSync.notifyChange).toHaveBeenCalledWith('delete', '', 'org')
    })
  })

  describe('moveItem', () => {
    it('moves item to new parent and refetches', async () => {
      mockApi.moveItem.mockResolvedValue({})

      const { moveItem } = useItems()
      await moveItem('id-1', 'new-parent')

      expect(mockApi.moveItem).toHaveBeenCalledWith('id-1', 'new-parent')
      expect(mockSync.notifyChange).toHaveBeenCalledWith('move', '', 'org')
    })

    it('moves item to root (empty parentId becomes null)', async () => {
      mockApi.moveItem.mockResolvedValue({})

      const { moveItem } = useItems()
      await moveItem('id-1', '')

      expect(mockApi.moveItem).toHaveBeenCalledWith('id-1', null)
    })
  })

  describe('changeOwnership', () => {
    it('changes ownership and refetches', async () => {
      mockApi.changeOwnership.mockResolvedValue({})

      const { changeOwnership } = useItems()
      await changeOwnership('id-1', 'personal')

      expect(mockApi.changeOwnership).toHaveBeenCalledWith('id-1', 'personal')
      expect(mockSync.notifyChange).toHaveBeenCalledWith('ownership', '', 'org')
    })
  })

  describe('convertItemType', () => {
    it('converts item type and returns childrenMoved', async () => {
      mockApi.convertItemType.mockResolvedValue({ item: { id: '1', itemType: 'box' }, childrenMoved: 3 })

      const { convertItemType } = useItems()
      const result = await convertItemType('id-1', 'box')

      expect(result).toEqual({ childrenMoved: 3 })
      expect(mockApi.convertItemType).toHaveBeenCalledWith('id-1', 'box')
      expect(mockSync.notifyChange).toHaveBeenCalledWith('update', '', 'org')
    })
  })

  describe('searchByBarcode', () => {
    it('searches and returns items', async () => {
      const mockItems = [{ id: '1', name: 'Found' }]
      mockApi.searchByBarcode.mockResolvedValue(mockItems)

      const { searchByBarcode } = useItems()
      const result = await searchByBarcode('4901234567890')

      expect(result).toEqual(mockItems)
      expect(mockApi.searchByBarcode).toHaveBeenCalledWith('4901234567890')
    })
  })

  describe('getItem', () => {
    it('returns item when found', async () => {
      const mockItem = { id: '1', name: 'Item' }
      mockApi.getItem.mockResolvedValue(mockItem)

      const { getItem } = useItems()
      const result = await getItem('1')

      expect(result).toEqual(mockItem)
    })

    it('returns null on error', async () => {
      mockApi.getItem.mockRejectedValue(new Error('Not found'))

      const { getItem } = useItems()
      const result = await getItem('bad-id')

      expect(result).toBeNull()
    })
  })

  describe('navigation', () => {
    it('navigateToChild adds breadcrumb and fetches', async () => {
      const { navigateToChild, breadcrumbs, currentParentId } = useItems()

      navigateToChild({ id: 'folder-1', name: 'Folder 1' } as any)

      expect(breadcrumbs.value).toEqual([{ id: 'folder-1', name: 'Folder 1' }])
      expect(currentParentId.value).toBe('folder-1')
      expect(mockApi.listItems).toHaveBeenCalled()
    })

    it('navigateToRoot resets breadcrumbs and fetches', async () => {
      const { navigateToChild, navigateToRoot, breadcrumbs, currentParentId } = useItems()

      navigateToChild({ id: 'folder-1', name: 'Folder 1' } as any)
      navigateToRoot()

      expect(breadcrumbs.value).toEqual([])
      expect(currentParentId.value).toBe('')
    })

    it('navigateToBreadcrumb slices breadcrumbs and fetches', async () => {
      const { navigateToChild, navigateToBreadcrumb, breadcrumbs, currentParentId } = useItems()

      navigateToChild({ id: 'f1', name: 'F1' } as any)
      navigateToChild({ id: 'f2', name: 'F2' } as any)
      navigateToChild({ id: 'f3', name: 'F3' } as any)

      expect(breadcrumbs.value.length).toBe(3)

      navigateToBreadcrumb(0)

      expect(breadcrumbs.value).toEqual([{ id: 'f1', name: 'F1' }])
      expect(currentParentId.value).toBe('f1')
    })

    it('navigateToBreadcrumb with out of range index sets empty parentId', async () => {
      const { navigateToBreadcrumb, currentParentId } = useItems()

      // breadcrumbs is empty, index 0 → slice(0,1) → []
      navigateToBreadcrumb(0)

      // breadcrumbs.value[0] is undefined → id is '' via ??
      expect(currentParentId.value).toBe('')
    })

    it('setOwnerType changes type and fetches', async () => {
      const { setOwnerType, ownerType } = useItems()

      setOwnerType('personal')

      expect(ownerType.value).toBe('personal')
      expect(mockApi.listItems).toHaveBeenCalled()
    })
  })

  describe('initSync', () => {
    it('registers onSync callback and starts sync', () => {
      const { initSync } = useItems()
      initSync()

      expect(mockSync.onSync).toHaveBeenCalledWith(expect.any(Function))
      expect(mockSync.start).toHaveBeenCalled()
    })

    it('sync callback refreshes when parentId and ownerType match', async () => {
      const { initSync } = useItems()
      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]
      mockApi.listItems.mockClear()

      // Current state: parentId='', ownerType='org'
      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: '',
        ownerType: 'org',
      })

      expect(mockApi.listItems).toHaveBeenCalled()
    })

    it('sync callback ignores when parentId does not match', () => {
      const { initSync } = useItems()
      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]
      mockApi.listItems.mockClear()

      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: 'other-parent',
        ownerType: 'org',
      })

      expect(mockApi.listItems).not.toHaveBeenCalled()
    })

    it('sync callback ignores when ownerType does not match', () => {
      const { initSync } = useItems()
      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]
      mockApi.listItems.mockClear()

      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: '',
        ownerType: 'personal',
      })

      expect(mockApi.listItems).not.toHaveBeenCalled()
    })

    it('sync callback ignores personal items from other users', () => {
      const { initSync } = useItems()
      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]
      mockApi.listItems.mockClear()

      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: '',
        ownerType: 'personal',
        userId: 'other-user',
      })

      expect(mockApi.listItems).not.toHaveBeenCalled()
    })

    it('sync callback processes personal items from same user', () => {
      mockSync.userId = computed(() => 'user-123')

      const { initSync, setOwnerType } = useItems()
      setOwnerType('personal')
      mockApi.listItems.mockClear()

      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]

      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: '',
        ownerType: 'personal',
        userId: 'user-123',
      })

      expect(mockApi.listItems).toHaveBeenCalled()
    })

    it('sync callback processes personal items with no userId', () => {
      const { initSync, setOwnerType } = useItems()
      setOwnerType('personal')
      mockApi.listItems.mockClear()

      initSync()

      const syncCallback = mockSync.onSync.mock.calls[0][0]

      // No userId in message → filter condition fails → proceeds
      syncCallback({
        type: 'items_changed',
        action: 'create',
        parentId: '',
        ownerType: 'personal',
      })

      expect(mockApi.listItems).toHaveBeenCalled()
    })
  })

  describe('return values', () => {
    it('exposes syncConnected from sync', () => {
      const { syncConnected } = useItems()
      expect(syncConnected.value).toBe(false)
    })
  })
})
