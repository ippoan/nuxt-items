<template>
  <UButtonGroup size="sm">
    <UButton
      :color="modelValue === 'org' ? 'primary' : 'gray'"
      @click="$emit('update:modelValue', 'org')"
    >
      {{ orgLabel }}
    </UButton>
    <UButton
      :color="modelValue === 'personal' ? 'primary' : 'gray'"
      @click="$emit('update:modelValue', 'personal')"
    >
      個人
    </UButton>
  </UButtonGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuth } from '@ippoan/auth-client'

defineProps<{
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

const { orgSlug } = useAuth()

const orgLabel = computed(() => orgSlug.value || '組織')
</script>
