export interface Item {
  id: string
  tenant_id: string
  parent_id: string | null
  owner_type: 'org' | 'personal'
  owner_user_id: string | null
  item_type: 'item' | 'folder'
  name: string
  barcode: string
  category: string
  description: string
  image_url: string
  url: string
  quantity: number
  created_at: string
  updated_at: string
}

export interface CreateItem {
  parent_id?: string | null
  owner_type?: string
  owner_user_id?: string | null
  item_type?: string
  name: string
  barcode?: string
  category?: string
  description?: string
  image_url?: string
  url?: string
  quantity?: number
}

export interface UpdateItem {
  name?: string
  barcode?: string
  category?: string
  description?: string
  image_url?: string
  url?: string
  quantity?: number
}

export interface ItemFile {
  id: string
  tenant_id: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
}
