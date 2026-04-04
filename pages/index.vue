<template>
  <div class="max-w-4xl mx-auto p-2 sm:p-4 overflow-x-hidden">
    <!-- ヘッダー -->
    <div class="flex items-center justify-between mb-3 sm:mb-4 gap-1 sm:gap-2 flex-wrap">
      <div class="flex items-center gap-1">
        <h1 class="text-lg sm:text-xl font-bold whitespace-nowrap">物品管理</h1>
        <span
          :class="syncConnected ? 'bg-green-400' : 'bg-gray-300'"
          class="w-2 h-2 rounded-full inline-block flex-shrink-0"
          :title="syncConnected ? '同期中' : '再接続中...'"
        />
      </div>
      <div class="flex items-center gap-1 sm:gap-2 flex-wrap min-w-0">
        <AuthToolbar :show-copy-url="false" :show-settings="false" :show-logout="false" :show-qr="!isMobile" />
        <ItemsOwnerTypeToggle v-model="ownerType" @update:model-value="onOwnerTypeChange" />
        <AuthToolbar :show-user-info="false" :show-qr="!isMobile" />
      </div>
    </div>

    <!-- パンくずリスト -->
    <div class="mb-3">
      <ItemsItemBreadcrumbs
        :breadcrumbs="breadcrumbs"
        @navigate="navigateToBreadcrumb"
        @navigate-root="navigateToRoot"
        @drop="onBreadcrumbDrop"
      />
    </div>

    <!-- バーコード検索 + NFCスキャン -->
    <div class="mb-4">
      <ItemsBarcodeSearch
        @search="onBarcodeSearch"
        @clear="onSearchClear"
        @nfc-scanned="onNfcScanned"
        @url-search="onUrlSearch"
      />
    </div>

    <!-- エラー表示 -->
    <UAlert
      v-if="error"
      color="red"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      :title="error"
      class="mb-4"
    />

    <!-- 検索結果モード -->
    <div v-if="searchMode" class="mb-3 space-y-2">
      <div class="flex items-center gap-2">
        <UBadge color="yellow" variant="subtle">
          検索結果: {{ searchResults.length }}件
        </UBadge>
        <UButton size="xs" variant="ghost" color="gray" @click="onSearchClear">
          戻る
        </UButton>
      </div>
      <!-- ローカル0件時: 外部API検索 -->
      <div v-if="searchResults.length === 0">
        <!-- 外部API検索中 -->
        <div v-if="lookupStatus === 'loading'" class="flex items-center gap-2 text-sm text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
          外部DBを検索中...
        </div>
        <!-- 外部API結果あり -->
        <UCard v-else-if="externalProduct" class="mb-2">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium">{{ externalProduct.name }}</p>
              <p v-if="externalProduct.category" class="text-sm text-gray-500">{{ externalProduct.category }}</p>
              <p class="text-xs text-gray-400">出典: {{ externalProduct.source }}</p>
            </div>
            <UButton
              size="xs"
              icon="i-heroicons-plus"
              @click="openCreateFormWithBarcode(lastSearchBarcode)"
            >
              この商品を登録
            </UButton>
          </div>
        </UCard>
        <!-- 外部APIも見つからない -->
        <div v-else-if="lookupStatus === 'not_found' || lookupStatus === 'error'" class="flex items-center gap-2 text-sm text-gray-500">
          <span>外部DBにも見つかりませんでした</span>
          <UButton
            size="xs"
            icon="i-heroicons-plus"
            @click="openCreateFormWithBarcode(lastSearchBarcode)"
          >
            手動で登録
          </UButton>
        </div>
      </div>
    </div>

    <!-- 物品一覧 -->
    <div class="flex justify-end mb-2">
      <UButton
        icon="i-heroicons-plus"
        label="新規"
        size="sm"
        @click="openCreateForm"
      />
    </div>
    <ItemsItemList
      :items="displayItems"
      :loading="status === 'pending'"
      :search-mode="searchMode"
      @navigate="navigateToChild"
      @select="onSelect"
      @edit="onEdit"
      @delete="onDelete"
      @nfc-write="onNfcWrite"
      @move="onMoveItem"
    />

    <!-- 作成/編集モーダル -->
    <UModal v-model="showForm" :fullscreen="isMobile">
      <ItemsItemForm
        :item="editingItem"
        :parent-id="currentParentId"
        :default-owner-type="ownerType || 'org'"
        :initial-barcode="pendingBarcode"
        :initial-product="pendingAmazonProduct"
        @submit="onSubmitForm"
        @cancel="showForm = false"
      />
    </UModal>

    <!-- NFC書き込み -->
    <ItemsNfcWriter
      v-if="nfcWriteItem"
      v-model="showNfcWriter"
      :item-id="nfcWriteItem.id"
      :item-name="nfcWriteItem.name"
    />

    <!-- 詳細表示モーダル -->
    <UModal v-model="showDetail" :fullscreen="isMobile">
      <ItemsItemDetail
        v-if="detailItem"
        :item="detailItem"
        @close="showDetail = false"
        @edit="onDetailEdit"
        @change-ownership="onChangeOwnership"
        @convert-type="onConvertType"
      />
    </UModal>

    <!-- 削除確認 -->
    <UModal v-model="showDeleteConfirm" :fullscreen="isMobile">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-red-600">削除確認</h3>
        </template>
        <p>「{{ deletingItem?.name }}」を削除しますか？</p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteConfirm = false">
              キャンセル
            </UButton>
            <UButton color="red" :loading="deleting" @click="confirmDelete">
              削除
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Item } from '~/types/item'
import type { InitialProduct } from '~/components/items/ItemForm.vue'
import { AuthToolbar, useAuth } from '@ippoan/auth-client'

const { setOwnerType: setAuthOwnerType } = useAuth()
const isMobile = useMediaQuery('(max-width: 640px)')
const { status: lookupStatus, product: externalProduct, lookup, lookupByUrl, reset: resetLookup } = useProductLookup()

const {
  items,
  status,
  error,
  currentParentId,
  ownerType,
  breadcrumbs,
  syncConnected,
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
} = useItems()

// フォーム状態
const showForm = ref(false)
const editingItem = ref<Item | null>(null)

// 削除確認状態
const showDeleteConfirm = ref(false)
const deletingItem = ref<Item | null>(null)
const deleting = ref(false)

// 詳細表示状態
const showDetail = ref(false)
const detailItem = ref<Item | null>(null)

// NFC書き込み状態
const showNfcWriter = ref(false)
const nfcWriteItem = ref<Item | null>(null)

// 検索状態
const searchMode = ref(false)
const searchResults = ref<Item[]>([])
const lastSearchBarcode = ref('')
const pendingBarcode = ref('')
const pendingAmazonProduct = ref<InitialProduct | null>(null)

const displayItems = computed(() =>
  searchMode.value ? searchResults.value : items.value
)

// 初回読み込み + WebSocket同期開始 + ?nfc= パラメータ処理
onMounted(async () => {
  fetchItems()
  initSync()

  // ?nfc=UUID パラメータがあればアイテムを表示
  const route = useRoute()
  const nfcItemId = route.query.nfc as string | undefined
  if (nfcItemId) {
    const item = await getItem(nfcItemId)
    if (item) {
      editingItem.value = item
      showForm.value = true
    }
    // URLからパラメータを削除
    navigateTo({ query: {} }, { replace: true })
    return
  }

  // ?url= or ?text= パラメータ（Web Share Target / Amazon URL共有）
  const sharedUrl = route.query.url as string | undefined
  const sharedText = route.query.text as string | undefined
  const sharedTitle = route.query.title as string | undefined
  const amazonUrl = extractAmazonUrl(sharedUrl, sharedText)
  if (amazonUrl) {
    navigateTo({ query: {} }, { replace: true })
    const nameFromShare = extractNameFromShareText(sharedText, sharedTitle)
    await openCreateFormWithAmazonUrl(amazonUrl, nameFromShare)
  }
})

function onOwnerTypeChange(type: string) {
  searchMode.value = false
  setOwnerType(type as any)
  setAuthOwnerType(type)
}

// Amazon URL 判定・抽出
function isAmazonLikeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return /^(www\.)?amazon\.(co\.jp|jp|com|co\.uk|de|fr|it|es|ca)$/.test(parsed.hostname)
      || parsed.hostname === 'amzn.asia'
      || parsed.hostname === 'amzn.to'
  } catch {
    return false
  }
}

function extractAmazonUrl(url?: string, text?: string): string | null {
  if (url && isAmazonLikeUrl(url)) return url
  if (text) {
    const urlMatch = text.match(/(https?:\/\/(?:www\.)?(?:amazon\.[\w.]+|amzn\.(?:asia|to))\S*)/i)
    if (urlMatch) return urlMatch[1]
  }
  return null
}

/** 共有テキストから商品名を抽出（URL部分を除去） */
function extractNameFromShareText(text?: string, title?: string): string {
  // Amazon の汎用 title（"Amazon.comでご覧ください" 等）は無視
  const isGenericTitle = title && /^Amazon[\s.]/.test(title.trim())
  if (title?.trim() && !isGenericTitle) return title.trim()
  if (!text) return ''
  // テキストからURLを除去して残りを商品名として使用
  const name = text.replace(/https?:\/\/\S+/gi, '').trim()
  return name
}

async function openCreateFormWithAmazonUrl(url: string, title?: string) {
  editingItem.value = null
  searchMode.value = false
  searchResults.value = []
  pendingBarcode.value = ''
  pendingAmazonProduct.value = { loading: true, url }
  showForm.value = true

  const result = await lookupByUrl(url)
  const finalProduct = {
    loading: false,
    url,
    name: result?.name || title || '',
    imageUrl: result?.imageUrl || '',
    description: result?.description || '',
  }
  pendingAmazonProduct.value = finalProduct
}

function openCreateForm() {
  editingItem.value = null
  pendingBarcode.value = ''
  pendingAmazonProduct.value = null
  showForm.value = true
}

function openCreateFormWithBarcode(barcode: string) {
  editingItem.value = null
  searchMode.value = false
  searchResults.value = []
  pendingBarcode.value = barcode
  pendingAmazonProduct.value = null
  showForm.value = true
}

async function onBreadcrumbDrop(payload: { itemId: string; parentId: string }) {
  try {
    await moveItem(payload.itemId, payload.parentId)
    const toast = useToast()
    toast.add({
      title: 'アイテムを移動しました',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (e: any) {
    const toast = useToast()
    toast.add({
      title: '移動に失敗しました',
      description: e.message || 'エラーが発生しました',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
    })
  }
}

async function onMoveItem(payload: { itemId: string; targetId: string }) {
  try {
    await moveItem(payload.itemId, payload.targetId)
    const toast = useToast()
    toast.add({
      title: 'アイテムを移動しました',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (e: any) {
    const toast = useToast()
    toast.add({
      title: '移動に失敗しました',
      description: e.message || 'エラーが発生しました',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
    })
  }
}

async function onChangeOwnership(item: Item, newOwnerType: string) {
  console.log('[ChangeOwnership] called:', item.id, newOwnerType)
  try {
    await changeOwnership(item.id, newOwnerType)
    console.log('[ChangeOwnership] success')
    showDetail.value = false
    const toast = useToast()
    toast.add({
      title: newOwnerType === 'personal' ? '個人に移動しました' : '組織に移動しました',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (e: any) {
    console.error('[ChangeOwnership] error:', e)
    const toast = useToast()
    toast.add({
      title: '移動に失敗しました',
      description: e.message || 'エラーが発生しました',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
    })
  }
}

async function onConvertType(item: Item, newItemType: string) {
  try {
    const response = await convertItemType(item.id, newItemType)
    showDetail.value = false
    const toast = useToast()
    const label = newItemType === 'folder' ? 'フォルダ' : 'アイテム'
    const moved = response.childrenMoved
    const msg = moved > 0
      ? `${label}に変換しました（${moved}件のアイテムを移動）`
      : `${label}に変換しました`
    toast.add({
      title: msg,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (e: any) {
    const toast = useToast()
    toast.add({
      title: '種別変更に失敗しました',
      description: e.message || 'エラーが発生しました',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
    })
  }
}

function onSelect(item: Item) {
  detailItem.value = item
  showDetail.value = true
}

function onDetailEdit(item: Item) {
  showDetail.value = false
  onEdit(item)
}

function onEdit(item: Item) {
  editingItem.value = item
  showForm.value = true
}

async function onSubmitForm(data: {
  name: string
  ownerType: string
  barcode: string
  category: string
  description: string
  imageUrl: string
  quantity: number
  itemType: string
}) {
  try {
    if (editingItem.value) {
      await updateItem(editingItem.value.id, data)
      // 種別が変わった場合は ConvertItemType を呼ぶ
      if (data.itemType && data.itemType !== editingItem.value.itemType) {
        await convertItemType(editingItem.value.id, data.itemType)
      }
    } else {
      await createItem(data)
    }
    showForm.value = false
    editingItem.value = null
    pendingBarcode.value = ''
  } catch (e: any) {
    // エラーは useItems 内で処理済み
  }
}

function onDelete(item: Item) {
  deletingItem.value = item
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!deletingItem.value) return
  deleting.value = true
  try {
    await deleteItem(deletingItem.value.id)
    showDeleteConfirm.value = false
    deletingItem.value = null
  } catch (e: any) {
    // エラーは useItems 内で処理済み
  } finally {
    deleting.value = false
  }
}

async function onUrlSearch(url: string) {
  await openCreateFormWithAmazonUrl(url)
}

async function onBarcodeSearch(barcode: string) {
  lastSearchBarcode.value = barcode
  resetLookup()
  try {
    searchResults.value = await searchByBarcode(barcode)
    searchMode.value = true
    // ローカル0件 → 外部API検索
    if (searchResults.value.length === 0) {
      await lookup(barcode)
    }
  } catch (e: any) {
    // エラーは useItems 内で処理済み
  }
}

function onSearchClear() {
  searchMode.value = false
  searchResults.value = []
  resetLookup()
}

// NFC
function onNfcWrite(item: Item) {
  nfcWriteItem.value = item
  showNfcWriter.value = true
}

async function onNfcScanned(itemId: string) {
  const item = await getItem(itemId)
  if (item) {
    editingItem.value = item
    showForm.value = true
  }
}
</script>
