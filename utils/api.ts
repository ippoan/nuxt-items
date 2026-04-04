/**
 * Items REST API クライアント
 *
 * rust-alc-api の /api/items/* エンドポイントを呼び出す。
 * gRPC を置き換え、ブラウザから直接 REST API にアクセスする。
 */
import type { Item, CreateItem, UpdateItem, ItemFile } from '~/types/item'

let apiBase = ''
let getToken: (() => string | null) | undefined

export function initItemsApi(base: string, tokenGetter?: () => string | null) {
  apiBase = base
  getToken = tokenGetter
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  }

  const token = getToken?.()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (opts.body && typeof opts.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${apiBase}${path}`, { ...opts, headers })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API エラー (${res.status}): ${text}`)
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// --- Items API ---

export async function listItems(parentId?: string, ownerType = 'org'): Promise<Item[]> {
  const params = new URLSearchParams({ owner_type: ownerType })
  if (parentId) params.set('parent_id', parentId)
  return apiFetch<Item[]>(`/api/items?${params}`)
}

export async function getItem(id: string): Promise<Item> {
  return apiFetch<Item>(`/api/items/${id}`)
}

export async function createItem(data: CreateItem): Promise<Item> {
  return apiFetch<Item>('/api/items', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateItem(id: string, data: UpdateItem): Promise<Item> {
  return apiFetch<Item>(`/api/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/api/items/${id}`, { method: 'DELETE' })
}

export async function moveItem(id: string, parentId: string | null): Promise<Item> {
  return apiFetch<Item>(`/api/items/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ parent_id: parentId || null }),
  })
}

export async function changeOwnership(id: string, ownerType: string): Promise<Item> {
  return apiFetch<Item>(`/api/items/${id}/ownership`, {
    method: 'POST',
    body: JSON.stringify({ owner_type: ownerType }),
  })
}

export interface ConvertResult {
  item: Item
  children_moved: number
}

export async function convertItemType(id: string, itemType: string): Promise<ConvertResult> {
  return apiFetch<ConvertResult>(`/api/items/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType }),
  })
}

export async function searchByBarcode(barcode: string): Promise<Item[]> {
  return apiFetch<Item[]>(`/api/items/search?barcode=${encodeURIComponent(barcode)}`)
}

// --- Files API ---

export async function uploadFile(file: File, resizedBlob: Blob): Promise<ItemFile> {
  const formData = new FormData()
  formData.append('file', resizedBlob, file.name || 'image.jpg')
  const token = getToken?.()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${apiBase}/api/item-files`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  return res.json() as Promise<ItemFile>
}

export async function downloadFile(id: string): Promise<Blob> {
  const token = getToken?.()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${apiBase}/api/item-files/${id}`, { headers })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res.blob()
}
