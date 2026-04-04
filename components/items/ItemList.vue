<template>
  <div>
    <!-- ローディング -->
    <div v-if="loading && !items.length" class="py-8 text-center text-sm text-gray-500">
      <div class="flex items-center justify-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        読み込み中...
      </div>
    </div>

    <!-- 空状態 -->
    <div v-if="!loading && !items.length" class="py-8 text-center text-sm text-gray-500">
      <div class="flex flex-col items-center gap-1">
        <UIcon name="i-heroicons-cube" class="text-2xl text-gray-300" />
        <span>物品がありません</span>
      </div>
    </div>

    <!-- モバイル: カードリスト -->
    <div v-if="isMobile && items.length" class="divide-y divide-gray-200 dark:divide-gray-700">
      <div
        v-for="row in items"
        :key="row.id"
        :draggable="!searchMode"
        :class="[
          'flex items-center gap-2 px-2 py-2 cursor-pointer active:bg-gray-100 dark:active:bg-gray-800',
          dragOverItemId === row.id && draggedItem?.id !== row.id
            ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-400 ring-inset'
            : '',
          draggedItem?.id === row.id ? 'opacity-40' : '',
        ]"
        @click="onRowClick(row)"
        @dragstart="onDragStart(row, $event)"
        @dragover.prevent="onDragOver(row, $event)"
        @dragenter.prevent="onDragEnter(row)"
        @dragleave="onDragLeave(row)"
        @drop.prevent="onDrop(row)"
        @dragend="onDragEnd"
      >
        <!-- 画像 -->
        <div class="flex-shrink-0">
          <ItemsImageThumbnail v-if="row.imageUrl" :uuid="row.imageUrl" />
          <div v-else class="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
            <UIcon name="i-heroicons-photo" class="text-gray-300 text-xs" />
          </div>
        </div>

        <!-- 名前 + カテゴリ -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1">
            <UIcon
              :name="isFolder(row) ? 'i-heroicons-folder' : 'i-heroicons-cube'"
              class="text-gray-400 flex-shrink-0 text-xs"
            />
            <span class="text-sm text-gray-900 dark:text-white truncate">{{ row.name }}</span>
          </div>
          <div v-if="row.category" class="mt-0.5">
            <UBadge color="gray" variant="subtle" size="xs">{{ row.category }}</UBadge>
          </div>
        </div>

        <!-- アクション -->
        <div class="flex-shrink-0 flex gap-0.5" @click.stop>
          <UButton
            v-if="isNfcSupported"
            icon="i-heroicons-signal"
            size="2xs"
            variant="ghost"
            color="gray"
            @click="$emit('nfc-write', row)"
          />
          <UButton
            icon="i-heroicons-information-circle"
            size="2xs"
            variant="ghost"
            color="gray"
            @click="$emit('select', row)"
          />
          <UButton
            icon="i-heroicons-pencil-square"
            size="2xs"
            variant="ghost"
            color="gray"
            @click="$emit('edit', row)"
          />
          <UButton
            icon="i-heroicons-trash"
            size="2xs"
            variant="ghost"
            color="red"
            @click="$emit('delete', row)"
          />
        </div>
      </div>
    </div>

    <!-- デスクトップ: テーブル -->
    <div v-if="!isMobile && items.length" class="relative overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead>
          <tr>
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider" />
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">名前</th>
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">種別</th>
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">カテゴリ</th>
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">数量</th>
            <th class="px-3 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr
            v-for="row in items"
            :key="row.id"
            :draggable="!searchMode"
            :class="[
              'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
              dragOverItemId === row.id && draggedItem?.id !== row.id
                ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-400 ring-inset'
                : '',
              draggedItem?.id === row.id ? 'opacity-40' : '',
            ]"
            @click="onRowClick(row)"
            @dragstart="onDragStart(row, $event)"
            @dragover.prevent="onDragOver(row, $event)"
            @dragenter.prevent="onDragEnter(row)"
            @dragleave="onDragLeave(row)"
            @drop.prevent="onDrop(row)"
            @dragend="onDragEnd"
          >
            <td class="px-3 py-2 whitespace-nowrap">
              <ItemsImageThumbnail v-if="row.imageUrl" :uuid="row.imageUrl" />
              <div v-else class="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                <UIcon name="i-heroicons-photo" class="text-gray-300 text-xs" />
              </div>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="isFolder(row) ? 'i-heroicons-folder' : 'i-heroicons-cube'"
                  class="text-gray-400"
                />
                <span class="text-sm text-gray-900 dark:text-white">{{ row.name }}</span>
              </div>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <UBadge
                :color="row.ownerType === 'org' ? 'green' : 'blue'"
                variant="subtle"
                size="xs"
              >
                {{ row.ownerType === 'org' ? '組織' : '個人' }}
              </UBadge>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <UBadge v-if="row.category" color="gray" variant="subtle" size="xs">
                {{ row.category }}
              </UBadge>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
              {{ row.quantity }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <div class="flex gap-1" @click.stop>
                <UButton
                  v-if="isNfcSupported"
                  icon="i-heroicons-signal"
                  size="xs"
                  variant="ghost"
                  color="gray"
                  title="NFCタグに書き込み"
                  @click="$emit('nfc-write', row)"
                />
                <UButton
                  icon="i-heroicons-information-circle"
                  size="xs"
                  variant="ghost"
                  color="gray"
                  title="詳細"
                  @click="$emit('select', row)"
                />
                <UButton
                  icon="i-heroicons-pencil-square"
                  size="xs"
                  variant="ghost"
                  color="gray"
                  title="編集"
                  @click="$emit('edit', row)"
                />
                <UButton
                  icon="i-heroicons-trash"
                  size="xs"
                  variant="ghost"
                  color="red"
                  title="削除"
                  @click="$emit('delete', row)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Item } from '~/types/item'

const props = defineProps<{
  items: Item[]
  loading: boolean
  searchMode?: boolean
}>()

const emit = defineEmits<{
  navigate: [item: Item]
  edit: [item: Item]
  delete: [item: Item]
  'nfc-write': [item: Item]
  select: [item: Item]
  move: [payload: { itemId: string; targetId: string }]
}>()

const { isSupported: isNfcSupported } = useNfc()

const isMobile = useMediaQuery('(max-width: 640px)')

function isFolder(item: Item): boolean {
  return item.itemType === 'folder'
}

// ドラッグ＆ドロップ状態
const draggedItem = ref<Item | null>(null)
const dragOverItemId = ref<string | null>(null)

function onRowClick(row: Item) {
  if (isFolder(row)) {
    emit('navigate', row)
  } else {
    emit('select', row)
  }
}

function onDragStart(item: Item, event: DragEvent) {
  if (props.searchMode) return
  draggedItem.value = item
  event.dataTransfer!.effectAllowed = 'move'
  event.dataTransfer!.setData('text/plain', item.id)
}

function onDragOver(item: Item, event: DragEvent) {
  if (!draggedItem.value || draggedItem.value.id === item.id) {
    event.dataTransfer!.dropEffect = 'none'
    return
  }
  event.dataTransfer!.dropEffect = 'move'
}

function onDragEnter(item: Item) {
  if (!draggedItem.value || draggedItem.value.id === item.id) return
  dragOverItemId.value = item.id
}

function onDragLeave(item: Item) {
  if (dragOverItemId.value === item.id) {
    dragOverItemId.value = null
  }
}

function onDrop(item: Item) {
  dragOverItemId.value = null
  if (!draggedItem.value || draggedItem.value.id === item.id) return
  emit('move', { itemId: draggedItem.value.id, targetId: item.id })
  draggedItem.value = null
}

function onDragEnd() {
  dragOverItemId.value = null
  draggedItem.value = null
}
</script>
