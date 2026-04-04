<template>
  <nav class="flex items-center gap-1 text-sm text-gray-600">
    <UButton
      variant="ghost"
      size="xs"
      icon="i-heroicons-home"
      :class="dropTargetId === '' ? 'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''"
      @click="$emit('navigateRoot')"
      @dragover.prevent="onHomeDragOver"
      @dragenter.prevent="dropTargetId = ''"
      @dragleave="onHomeDragLeave"
      @drop.prevent="onHomeDrop"
    />
    <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
      <span class="text-gray-400">/</span>
      <UButton
        variant="ghost"
        size="xs"
        :label="crumb.name"
        :class="dropTargetId === crumb.id ? 'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''"
        @click="$emit('navigate', index)"
        @dragover.prevent="onCrumbDragOver"
        @dragenter.prevent="dropTargetId = crumb.id"
        @dragleave="onCrumbDragLeave(crumb.id)"
        @drop.prevent="onCrumbDrop(crumb.id, $event)"
      />
    </template>
  </nav>
</template>

<script setup lang="ts">
import type { BreadcrumbItem } from '~/composables/useItems'

defineProps<{
  breadcrumbs: BreadcrumbItem[]
}>()

const emit = defineEmits<{
  navigate: [index: number]
  navigateRoot: []
  drop: [payload: { itemId: string; parentId: string }]
}>()

const dropTargetId = ref<string | null>(null)

function onHomeDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = 'move'
}

function onHomeDragLeave() {
  if (dropTargetId.value === '') {
    dropTargetId.value = null
  }
}

function onHomeDrop(event: DragEvent) {
  const itemId = event.dataTransfer!.getData('text/plain')
  dropTargetId.value = null
  if (itemId) {
    emit('drop', { itemId, parentId: '' })
  }
}

function onCrumbDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = 'move'
}

function onCrumbDragLeave(crumbId: string) {
  if (dropTargetId.value === crumbId) {
    dropTargetId.value = null
  }
}

function onCrumbDrop(crumbId: string, event: DragEvent) {
  const itemId = event.dataTransfer!.getData('text/plain')
  dropTargetId.value = null
  if (itemId) {
    emit('drop', { itemId, parentId: crumbId })
  }
}
</script>
