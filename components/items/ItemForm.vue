<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">
        {{ isEdit ? '物品を編集' : '物品を追加' }}
      </h3>
    </template>

    <div class="space-y-3 sm:space-y-4">
      <UFormGroup v-if="form.itemType !== 'folder'" label="バーコード">
        <div class="flex gap-2">
          <UInput v-model="form.barcode" placeholder="バーコード（任意）" class="flex-1" @keyup.enter="onBarcodeLookup" />
          <UButton
            icon="i-heroicons-magnifying-glass"
            size="sm"
            color="gray"
            :loading="lookupStatus === 'loading'"
            :disabled="!form.barcode.trim()"
            title="商品情報を検索"
            @click="onBarcodeLookup"
          />
          <UButton
            icon="i-heroicons-camera"
            size="sm"
            color="gray"
            title="カメラでスキャン"
            @click="showBarcodeScanner = true"
          />
        </div>
      </UFormGroup>
      <template v-if="form.itemType !== 'folder'">
        <ItemsBarcodeScanner
          v-model="showBarcodeScanner"
          @scanned="onBarcodeScanned"
        />

        <!-- 商品検索ステータス -->
        <div v-if="lookupStatus === 'loading'" class="flex items-center gap-2 text-sm text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
          商品情報を検索中...
        </div>
        <UAlert
          v-else-if="lookupStatus === 'found'"
          color="green"
          variant="subtle"
          icon="i-heroicons-check-circle"
          title="商品情報を自動入力しました"
          :close-button="{ icon: 'i-heroicons-x-mark', variant: 'ghost', size: '2xs' }"
          @close="resetLookup"
        />
        <UAlert
          v-else-if="lookupStatus === 'not_found'"
          color="yellow"
          variant="subtle"
          icon="i-heroicons-information-circle"
          title="商品情報が見つかりませんでした。手動で入力してください。"
          :close-button="{ icon: 'i-heroicons-x-mark', variant: 'ghost', size: '2xs' }"
          @close="resetLookup"
        />
        <UAlert
          v-else-if="lookupStatus === 'error'"
          color="red"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
          title="商品検索でエラーが発生しました"
          :close-button="{ icon: 'i-heroicons-x-mark', variant: 'ghost', size: '2xs' }"
          @close="resetLookup"
        />

        <!-- initialProduct ロード中 -->
        <div v-if="initialProduct?.loading" class="flex items-center gap-2 text-sm text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
          商品情報を取得中...
        </div>

        <!-- Amazon 商品画像プレビュー -->
        <div v-if="amazonImageUrl" class="flex items-center gap-3">
          <img :src="amazonImageUrl" class="w-20 h-20 object-contain rounded border" alt="商品画像" />
          <p class="text-xs text-gray-400">Amazon 商品画像（参考）</p>
        </div>
      </template>

      <UFormGroup label="名前" required>
        <UInput v-model="form.name" placeholder="物品名を入力" />
      </UFormGroup>

      <UFormGroup label="画像">
        <ItemsImagePicker v-model="form.imageUrl" />
      </UFormGroup>

      <UFormGroup v-if="!isEdit" label="所有">
        <USelectMenu
          v-model="form.ownerType"
          :options="ownerTypeOptions"
          value-attribute="value"
          option-attribute="label"
        />
      </UFormGroup>

      <UFormGroup label="種別">
        <UButtonGroup size="sm">
          <UButton
            :color="form.itemType === 'item' ? 'primary' : 'gray'"
            @click="form.itemType = 'item'"
          >
            アイテム
          </UButton>
          <UButton
            :color="form.itemType === 'folder' ? 'primary' : 'gray'"
            @click="form.itemType = 'folder'"
          >
            フォルダ
          </UButton>
        </UButtonGroup>
      </UFormGroup>

      <UFormGroup label="カテゴリ">
        <UInput v-model="form.category" placeholder="カテゴリ（任意）" />
      </UFormGroup>

      <UFormGroup label="説明">
        <UTextarea v-model="form.description" placeholder="説明（任意）" :rows="2" />
      </UFormGroup>

      <UFormGroup v-if="form.itemType !== 'folder'" label="URL">
        <UInput v-model="form.url" placeholder="https://..." type="url" />
      </UFormGroup>

      <UFormGroup label="数量">
        <UInput v-model.number="form.quantity" type="number" :min="0" />
      </UFormGroup>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="$emit('cancel')">
          キャンセル
        </UButton>
        <UButton :disabled="!form.name.trim()" :loading="submitting" @click="onSubmit">
          {{ isEdit ? '更新' : '作成' }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { Item } from '@yhonda-ohishi-pub-dev/logi-proto'

export interface InitialProduct {
  loading: boolean
  url: string
  name?: string
  imageUrl?: string
  description?: string
}

const props = defineProps<{
  item?: Item | null
  parentId?: string
  defaultOwnerType?: string
  initialBarcode?: string
  initialProduct?: InitialProduct | null
}>()

const emit = defineEmits<{
  submit: [data: {
    name: string
    ownerType: string
    barcode: string
    category: string
    description: string
    imageUrl: string
    url: string
    quantity: number
    itemType: string
  }]
  cancel: []
}>()

const isEdit = computed(() => !!props.item)
const submitting = ref(false)
const showBarcodeScanner = ref(false)

const { status: lookupStatus, lookup, reset: resetLookup } = useProductLookup()

const ownerTypeOptions = [
  { value: 'org', label: '組織' },
  { value: 'personal', label: '個人' },
]

const itemTypeOptions = [
  { value: 'item', label: 'アイテム' },
  { value: 'folder', label: 'フォルダ' },
]

const form = reactive({
  name: props.item?.name ?? '',
  ownerType: props.item?.ownerType ?? props.defaultOwnerType ?? 'org',
  barcode: props.item?.barcode ?? '',
  category: props.item?.category ?? '',
  description: props.item?.description ?? '',
  imageUrl: props.item?.imageUrl ?? '',
  url: props.item?.url ?? '',
  quantity: props.item?.quantity ?? 1,
  itemType: props.item?.itemType ?? 'item',
})

watch(() => props.item, (newItem) => {
  resetLookup()
  if (newItem) {
    form.name = newItem.name
    form.ownerType = newItem.ownerType
    form.barcode = newItem.barcode
    form.category = newItem.category
    form.description = newItem.description
    form.imageUrl = newItem.imageUrl
    form.url = newItem.url ?? ''
    form.quantity = newItem.quantity
    form.itemType = newItem.itemType || 'item'
  } else {
    form.name = ''
    form.ownerType = props.defaultOwnerType ?? 'org'
    form.barcode = ''
    form.category = ''
    form.description = ''
    form.imageUrl = ''
    form.url = ''
    form.quantity = 1
    form.itemType = 'item'
  }
})

// initialBarcode が渡されたら自動検索
watch(() => props.initialBarcode, (barcode) => {
  if (barcode && !isEdit.value) {
    form.barcode = barcode
    onBarcodeLookup()
  }
}, { immediate: true })

// Amazon 商品画像URL（参考プレビュー用）
const amazonImageUrl = ref('')

// initialProduct が渡されたらフォームを自動入力
watch(() => props.initialProduct, (product) => {
  if (product && !product.loading && !isEdit.value) {
    if (product.name && !form.name.trim()) form.name = product.name
    if (product.description && !form.description.trim()) form.description = product.description
    if (product.url && !form.url.trim()) form.url = product.url
    if (product.imageUrl) amazonImageUrl.value = product.imageUrl
  }
}, { deep: true, immediate: true })

async function applyLookupResult(barcode: string) {
  const result = await lookup(barcode)
  if (result) {
    if (!form.name.trim()) form.name = result.name
    if (!form.category.trim()) form.category = result.category
    if (!form.description.trim()) form.description = result.description
  }
}

async function onBarcodeScanned(code: string) {
  form.barcode = code
  await applyLookupResult(code)
}

async function onBarcodeLookup() {
  if (!form.barcode.trim()) return
  await applyLookupResult(form.barcode.trim())
}

async function onSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    emit('submit', { ...form })
  } finally {
    submitting.value = false
  }
}
</script>
