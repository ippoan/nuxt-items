export interface Item {
  id: string
  tenantId: string
  parentId: string | null
  ownerType: 'org' | 'personal'
  ownerUserId: string | null
  itemType: 'item' | 'folder'
  name: string
  barcode: string
  category: string
  description: string
  imageUrl: string
  url: string
  quantity: number
  createdAt: string
  updatedAt: string
}

export interface CreateItem {
  parentId?: string | null
  ownerType?: string
  ownerUserId?: string | null
  itemType?: string
  name: string
  barcode?: string
  category?: string
  description?: string
  imageUrl?: string
  url?: string
  quantity?: number
}

export interface UpdateItem {
  name?: string
  barcode?: string
  category?: string
  description?: string
  imageUrl?: string
  url?: string
  quantity?: number
}

export interface ItemFile {
  id: string
  tenantId: string
  filename: string
  contentType: string
  sizeBytes: number
  createdAt: string
}
