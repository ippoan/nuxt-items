export interface ProductInfo {
  name: string
  category: string
  description: string
  imageUrl: string
  source: 'rakuten' | 'openfoodfacts' | 'openproductsfacts' | 'amazon'
}

export type LookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

const OPEN_FACTS_SOURCES = [
  { url: 'https://world.openfoodfacts.org/api/v2/product/', source: 'openfoodfacts' as const },
  { url: 'https://world.openproductsfacts.org/api/v2/product/', source: 'openproductsfacts' as const },
]

const FIELDS = 'code,product_name,product_name_ja,brands,categories,categories_tags,generic_name'
const TIMEOUT_MS = 8000

/** 楽天製品検索API（サーバールート経由） */
async function fetchRakuten(
  barcode: string,
  signal: AbortSignal,
): Promise<ProductInfo | null> {
  const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(barcode)}`, { signal })
  if (!res.ok) return null
  const data = await res.json() as { found: boolean; name?: string; category?: string; description?: string; maker?: string; brand?: string; imageUrl?: string }
  if (!data.found || !data.name) return null
  const nameParts = [data.brand, data.name].filter(Boolean)
  const name = data.brand && data.name?.includes(data.brand) ? data.name : nameParts.join(' ')
  return {
    name,
    category: data.category || '',
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    source: 'rakuten',
  }
}

function extractName(product: Record<string, any>): string {
  if (product.product_name_ja) return product.product_name_ja
  const name = product.product_name || ''
  const brands = product.brands || ''
  if (name && brands && !name.includes(brands)) return `${brands} ${name}`
  return name || brands
}

function extractCategory(product: Record<string, any>): string {
  const tags: string[] = product.categories_tags || []
  const jaTag = tags.find((t) => t.startsWith('ja:'))
  if (jaTag) return jaTag.replace('ja:', '')
  if (product.categories) return product.categories.split(',')[0].trim()
  return ''
}

function extractDescription(product: Record<string, any>): string {
  return product.generic_name || ''
}

async function fetchOpenFacts(
  baseUrl: string,
  barcode: string,
  signal: AbortSignal,
): Promise<Record<string, any> | null> {
  const url = `${baseUrl}${barcode}?fields=${FIELDS}`
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'nuxt-items/1.0 (items.mtamaramu.com)' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { status?: number; product?: Record<string, any> }
  if (data.status === 0 || !data.product) return null
  if (!data.product.product_name && !data.product.product_name_ja) return null
  return data.product
}

export function useProductLookup() {
  const status = ref<LookupStatus>('idle')
  const product = ref<ProductInfo | null>(null)
  const errorMessage = ref('')

  async function lookup(barcode: string): Promise<ProductInfo | null> {
    if (!barcode.trim()) return null

    status.value = 'loading'
    product.value = null
    errorMessage.value = ''

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      // 1. 楽天製品検索API（日本商品に強い）
      try {
        const result = await fetchRakuten(barcode.trim(), controller.signal)
        if (result) {
          product.value = result
          status.value = 'found'
          return result
        }
      } catch (e: any) {
        if (e.name === 'AbortError') throw e
        // 楽天が失敗してもOpenFacts系を試す
      }

      // 2. OpenFoodFacts / OpenProductsFacts（海外商品フォールバック）
      for (const src of OPEN_FACTS_SOURCES) {
        try {
          const raw = await fetchOpenFacts(src.url, barcode.trim(), controller.signal)
          if (raw) {
            const info: ProductInfo = {
              name: extractName(raw),
              category: extractCategory(raw),
              description: extractDescription(raw),
              imageUrl: '',
              source: src.source,
            }
            product.value = info
            status.value = 'found'
            return info
          }
        } catch (e: any) {
          if (e.name === 'AbortError') throw e
          // このソースが失敗しても次を試す
        }
      }
      status.value = 'not_found'
      return null
    } catch {
      // outer catch に到達するのは AbortError のみ（inner catch が non-abort を吸収）
      errorMessage.value = 'タイムアウトしました'
      status.value = 'error'
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  async function lookupByUrl(url: string): Promise<ProductInfo | null> {
    if (!url.trim()) return null

    status.value = 'loading'
    product.value = null
    errorMessage.value = ''

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(`/api/amazon-lookup?url=${encodeURIComponent(url.trim())}`, {
        signal: controller.signal,
      })
      if (!res.ok) {
        status.value = 'error'
        return null
      }
      const data = await res.json() as { found: boolean; name?: string; imageUrl?: string; description?: string }
      if (!data.found || !data.name) {
        status.value = 'not_found'
        return null
      }
      const info: ProductInfo = {
        name: data.name,
        category: '',
        description: data.description || '',
        imageUrl: data.imageUrl || '',
        source: 'amazon',
      }
      product.value = info
      status.value = 'found'
      return info
    } catch (e: any) {
      if (e.name === 'AbortError') {
        errorMessage.value = 'タイムアウトしました'
      } else {
        errorMessage.value = e.message || '不明なエラー'
      }
      status.value = 'error'
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  function reset() {
    status.value = 'idle'
    product.value = null
    errorMessage.value = ''
  }

  return { status: readonly(status), product: readonly(product), errorMessage: readonly(errorMessage), lookup, lookupByUrl, reset }
}
