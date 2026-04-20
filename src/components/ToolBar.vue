<template>
  <div class="toolbar">

    <!-- 工具组 -->
    <div class="section-label">工具</div>
    <div class="btn-group">
      <n-tooltip v-for="tool in tools" :key="tool.type" placement="right" :delay="400">
        <template #trigger>
          <button
            class="tool-btn"
            :class="{ active: activeTool === tool.type }"
            @click="emit('toolChange', tool.type)"
          >
            <span class="tool-icon">{{ tool.icon }}</span>
            <span class="tool-label">{{ tool.label }}</span>
          </button>
        </template>
        {{ tool.tip }}
      </n-tooltip>
    </div>

    <div class="divider" />

    <!-- 视角组 -->
    <div class="section-label">视角</div>
    <div class="btn-group">
      <n-tooltip v-for="view in views" :key="view.type" placement="right" :delay="400">
        <template #trigger>
          <button class="tool-btn" @click="emit('viewChange', view.type)">
            <span class="tool-icon">{{ view.icon }}</span>
            <span class="tool-label">{{ view.label }}</span>
          </button>
        </template>
        {{ view.tip }}
      </n-tooltip>
      <button class="tool-btn" @click="emit('resetView')">
        <span class="tool-icon">⟳</span>
        <span class="tool-label">重置</span>
      </button>
    </div>

    <div class="divider" />

    <!-- 渲染控制 -->
    <div class="section-label">渲染</div>
    <div class="control-item">
      <span class="ctrl-label">颜色</span>
      <n-select
        :value="colorMode"
        :options="colorModeOptions"
        size="small"
        :consistent-menu-width="false"
        @update:value="emit('colorModeChange', $event)"
      />
    </div>
    <div class="control-item">
      <span class="ctrl-label">点大小 <b>{{ pointSize.toFixed(1) }}</b></span>
      <n-slider
        :value="pointSize"
        :min="0.5"
        :max="10"
        :step="0.5"
        :tooltip="false"
        @update:value="emit('pointSizeChange', $event)"
      />
    </div>

    <div class="divider" />

    <!-- 撤销重做 -->
    <div class="section-label">操作</div>
    <div class="btn-row">
      <button class="action-btn" :disabled="!canUndo" @click="emit('undo')">
        ↩ 撤销
      </button>
      <button class="action-btn" :disabled="!canRedo" @click="emit('redo')">
        ↪ 重做
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { NTooltip, NSelect, NSlider } from 'naive-ui'
import type { ToolType, ColorMode } from '@/types'

defineProps<{
  activeTool: ToolType
  colorMode: ColorMode
  pointSize: number
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  toolChange: [tool: ToolType]
  viewChange: [view: 'top' | 'front' | 'side']
  resetView: []
  colorModeChange: [mode: ColorMode]
  pointSizeChange: [size: number]
  undo: []
  redo: []
}>()

const tools = [
  { type: 'select'      as ToolType, icon: '↖', label: '选择',   tip: '选择模式（拖拽旋转场景）' },
  { type: 'boundingbox' as ToolType, icon: '▭', label: '包围盒', tip: '拖拽创建 3D 包围盒' },
  { type: 'brush'       as ToolType, icon: '●', label: '笔刷',   tip: '笔刷语义标注' },
  { type: 'rectselect'  as ToolType, icon: '▣', label: '框选',   tip: '矩形框选语义标注' },
]

const views = [
  { type: 'top'   as const, icon: 'T', label: '俯视', tip: '切换到俯视图' },
  { type: 'front' as const, icon: 'F', label: '前视', tip: '切换到前视图' },
  { type: 'side'  as const, icon: 'S', label: '侧视', tip: '切换到侧视图' },
]

const colorModeOptions = [
  { label: '强度', value: 'intensity' },
  { label: '高度', value: 'height' },
  { label: '语义', value: 'semantic' },
]
</script>

<style scoped>
.toolbar {
  width: 120px;
  height: 100%;
  background: #16162a;
  border-right: 1px solid #2a2a40;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 2px;
  margin-top: 2px;
}

.divider {
  height: 1px;
  background: #2a2a40;
  margin: 2px 0;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  text-align: left;
}
.tool-btn:hover {
  background: #252540;
  color: #ddd;
  border-color: #3a3a55;
}
.tool-btn.active {
  background: #1e3a6e;
  color: #60a5fa;
  border-color: #3b6fd4;
}

.tool-icon {
  font-size: 13px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
  font-style: normal;
}

.tool-label {
  font-size: 11px;
  white-space: nowrap;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
}

.ctrl-label {
  font-size: 11px;
  color: #888;
}
.ctrl-label b {
  color: #bbb;
  font-weight: 600;
}

.btn-row {
  display: flex;
  gap: 4px;
}

.action-btn {
  flex: 1;
  padding: 4px 4px;
  border: 1px solid #2a2a40;
  border-radius: 4px;
  background: #1e1e30;
  color: #aaa;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.15s;
  white-space: nowrap;
}
.action-btn:hover:not(:disabled) {
  background: #252540;
  color: #ddd;
  border-color: #3a3a55;
}
.action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
