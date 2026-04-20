<template>
  <div class="annotation-list">
    <div class="list-header">
      <span>包围盒列表</span>
      <n-tag size="small">{{ boxes.length }}</n-tag>
    </div>
    <n-scrollbar style="max-height: 300px">
      <div
        v-for="(box, idx) in boxes"
        :key="box.id"
        class="box-item"
        :class="{ selected: selectedBoxId === box.id }"
        @click="emit('select', box.id)"
      >
        <div class="box-color" :style="{ background: box.color }" />
        <div class="box-info">
          <div class="box-label">{{ box.label }}</div>
          <div class="box-id">#{{ idx + 1 }}</div>
        </div>
        <n-button
          size="tiny"
          type="error"
          ghost
          @click.stop="emit('delete', box.id)"
        >✕</n-button>
      </div>
      <div v-if="boxes.length === 0" class="empty-hint">暂无标注</div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { NTag, NScrollbar, NButton } from 'naive-ui'
import type { BoundingBox3D } from '@/types'

defineProps<{
  boxes: BoundingBox3D[]
  selectedBoxId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()
</script>

<style scoped>
.annotation-list {
  padding: 8px;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
}
.box-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.box-item:hover { background: #2a2a3e; }
.box-item.selected { background: #2d3a5e; }
.box-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}
.box-info {
  flex: 1;
  min-width: 0;
}
.box-label {
  font-size: 12px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.box-id {
  font-size: 10px;
  color: #666;
}
.empty-hint {
  text-align: center;
  color: #555;
  font-size: 12px;
  padding: 16px;
}
</style>
