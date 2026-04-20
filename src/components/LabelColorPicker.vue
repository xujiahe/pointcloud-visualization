<template>
  <div class="label-color-picker">
    <div class="section-title">语义类别</div>
    <div
      v-for="cat in categories"
      :key="cat.id"
      class="category-row"
      :class="{ active: activeCategoryId === cat.id }"
      @click="emit('selectCategory', cat.id)"
    >
      <n-color-picker
        :value="cat.color"
        :show-alpha="false"
        size="small"
        style="width: 32px"
        @update:value="emit('colorChange', cat.id, $event)"
        @click.stop
      />
      <span class="cat-name">{{ cat.name }}</span>
      <n-tag v-if="activeCategoryId === cat.id" size="tiny" type="primary">当前</n-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NColorPicker, NTag } from 'naive-ui'
import type { SemanticCategory } from '@/types'

defineProps<{
  categories: SemanticCategory[]
  activeCategoryId: number
}>()

const emit = defineEmits<{
  selectCategory: [id: number]
  colorChange: [id: number, color: string]
}>()
</script>

<style scoped>
.label-color-picker {
  padding: 8px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
}
.category-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.category-row:hover { background: #2a2a3e; }
.category-row.active { background: #2d3a5e; }
.cat-name {
  flex: 1;
  font-size: 12px;
  color: #ddd;
}
</style>
