<template>
  <div>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold truncate mr-2">{{ item.name }}</h3>
          <UButtonGroup size="xs">
            <UButton
              :color="item.ownerType === 'org' ? 'primary' : 'gray'"
              @click="onToggle('org')"
            >
              {{ orgLabel }}
            </UButton>
            <UButton
              :color="item.ownerType === 'personal' ? 'primary' : 'gray'"
              @click="onToggle('personal')"
            >
              個人
            </UButton>
          </UButtonGroup>
        </div>
      </template>

      <div class="space-y-4">
        <!-- 画像 -->
        <div v-if="imageSrc" class="flex justify-center">
          <img :src="imageSrc" class="max-w-full max-h-64 object-contain rounded-lg" />
        </div>

        <dl class="space-y-3">
          <div v-if="item.barcode">
            <dt class="text-xs text-gray-500">バーコード</dt>
            <dd class="text-sm">{{ item.barcode }}</dd>
          </div>
          <div v-if="item.category">
            <dt class="text-xs text-gray-500">カテゴリ</dt>
            <dd><UBadge color="gray" variant="subtle" size="xs">{{ item.category }}</UBadge></dd>
          </div>
          <div v-if="item.description">
            <dt class="text-xs text-gray-500">説明</dt>
            <dd class="text-sm whitespace-pre-wrap">{{ item.description }}</dd>
          </div>
          <div v-if="item.url">
            <dt class="text-xs text-gray-500">URL</dt>
            <dd class="text-sm">
              <a :href="item.url" target="_blank" rel="noopener" class="text-primary-500 underline break-all">
                {{ item.url }}
              </a>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">種別</dt>
            <dd class="text-sm">
              <UButtonGroup size="xs">
                <UButton
                  :color="item.itemType === 'folder' ? 'primary' : 'gray'"
                  @click="onConvertType('folder')"
                >
                  フォルダ
                </UButton>
                <UButton
                  :color="item.itemType === 'item' ? 'primary' : 'gray'"
                  @click="onConvertType('item')"
                >
                  アイテム
                </UButton>
              </UButtonGroup>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">数量</dt>
            <dd class="text-sm">{{ item.quantity }}</dd>
          </div>
          <div v-if="item.createdAt">
            <dt class="text-xs text-gray-500">登録日</dt>
            <dd class="text-sm">{{ formatDate(item.createdAt) }}</dd>
          </div>
        </dl>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="$emit('close')">
            閉じる
          </UButton>
          <UButton icon="i-heroicons-pencil-square" @click="$emit('edit', item)">
            編集
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- 種別変更確認 -->
    <UModal v-model="showConvertConfirm">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">種別変更</h3>
        </template>
        <p>
          「{{ item.name }}」を
          <strong>{{ pendingItemType === 'folder' ? 'フォルダ' : 'アイテム' }}</strong>
          に変換しますか？
        </p>
        <p v-if="item.itemType === 'folder' && pendingItemType === 'item'" class="text-sm text-amber-600 mt-2">
          フォルダ内のアイテムは親フォルダに移動されます。
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showConvertConfirm = false">
              キャンセル
            </UButton>
            <UButton color="primary" @click="confirmConvertType">
              変換
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 所有権変更確認 -->
    <UModal v-model="showOwnershipConfirm">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">所有権変更</h3>
        </template>
        <p>
          「{{ item.name }}」を
          <strong>{{ pendingOwnerType === 'personal' ? '個人' : orgLabel }}</strong>
          に移動しますか？
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showOwnershipConfirm = false">
              キャンセル
            </UButton>
            <UButton color="primary" @click="confirmOwnershipChange">
              移動
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Item } from '@yhonda-ohishi-pub-dev/logi-proto'
import { useAuth } from '@yhonda-ohishi-pub-dev/auth-client'

const props = defineProps<{
  item: Item
}>()

const emit = defineEmits<{
  close: []
  edit: [item: Item]
  'change-ownership': [item: Item, newOwnerType: string]
  'convert-type': [item: Item, newItemType: string]
}>()

const { orgSlug } = useAuth()
const orgLabel = computed(() => orgSlug.value || '組織')

const { getImageUrl } = useImageCache()
const imageSrc = ref<string | null>(null)

// 種別変更確認
const showConvertConfirm = ref(false)
const pendingItemType = ref('')

function onConvertType(type: string) {
  if (type === props.item.itemType) return
  pendingItemType.value = type
  showConvertConfirm.value = true
}

function confirmConvertType() {
  showConvertConfirm.value = false
  emit('convert-type', props.item, pendingItemType.value)
}

// 所有権変更確認
const showOwnershipConfirm = ref(false)
const pendingOwnerType = ref('')

function onToggle(type: string) {
  if (type === props.item.ownerType) return
  pendingOwnerType.value = type
  showOwnershipConfirm.value = true
}

function confirmOwnershipChange() {
  showOwnershipConfirm.value = false
  emit('change-ownership', props.item, pendingOwnerType.value)
}

watch(() => props.item.imageUrl, async (uuid) => {
  imageSrc.value = uuid ? await getImageUrl(uuid) : null
}, { immediate: true })

function formatDate(isoString: string): string {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleDateString('ja-JP')
  } catch {
    return isoString
  }
}
</script>
