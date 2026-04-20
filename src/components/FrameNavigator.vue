<template>
  <div class="frame-navigator">
    <div class="nav-header">
      <span class="nav-title">帧列表</span>
      <n-button size="tiny" @click="emit('addFrame')">+ 添加帧</n-button>
    </div>
    <div class="frames-scroll">
      <div
        v-for="frame in frames"
        :key="frame.id"
        class="frame-item"
        :class="[`status-${frame.status}`, { current: currentFrameId === frame.id }]"
        @click="emit('switchFrame', frame.id)"
      >
        <div class="frame-status-dot" />
        <div class="frame-name">{{ frame.name }}</div>
        <n-tag :type="statusType(frame.status)" size="tiny">
          {{ statusLabel(frame.status) }}
        </n-tag>
      </div>
      <div v-if="frames.length === 0" class="empty-hint">暂无帧，请添加</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NTag } from 'naive-ui'
import type { FrameRecord } from '@/types'

defineProps<{
  frames: FrameRecord[]
  currentFrameId: string | null
}>()

const emit = defineEmits<{
  switchFrame: [id: string]
  addFrame: []
}>()

function statusType(status: FrameRecord['status']): 'default' | 'success' | 'warning' {
  if (status === 'completed') return 'success'
  if (status === 'in-progress') return 'warning'
  return 'default'
}

function statusLabel(status: FrameRecord['status']): string {
  if (status === 'completed') return '已完成'
  if (status === 'in-progress') return '标注中'
  return '未标注'
}
</script>

<style scoped>
.frame-navigator {
  height: 100%;
  background: #1e1e2e;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
}
.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #333;
}
.nav-title {
  font-size: 12px;
  color: #aaa;
  font-weight: 600;
}
.frames-scroll {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  flex: 1;
  align-items: center;
}
.frame-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #333;
  background: #252535;
  white-space: nowrap;
  transition: all 0.15s;
  flex-shrink: 0;
}
.frame-item:hover { border-color: #555; }
.frame-item.current { border-color: #4a9eff; background: #1a2a4e; }
.frame-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
}
.status-completed .frame-status-dot { background: #4ade80; }
.status-in-progress .frame-status-dot { background: #fbbf24; }
.frame-name {
  font-size: 12px;
  color: #ccc;
}
.empty-hint {
  color: #555;
  font-size: 12px;
  padding: 8px;
}
</style>
