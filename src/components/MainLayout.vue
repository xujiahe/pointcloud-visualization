<template>
  <n-config-provider :theme="darkTheme">
    <n-message-provider>
      <div class="main-layout">
        <!-- 顶部工具栏 -->
        <div class="top-bar">
          <div class="app-title">🌐 点云可视化标注平台</div>
          <div class="top-actions">
            <!-- 加载文件 -->
            <n-upload
              :show-file-list="false"
              accept=".bin,.pcd,.las,.laz"
              @change="handleFileUpload"
            >
              <n-button size="small" :loading="isLoading">
                {{ isLoading ? `加载中 ${progress}%` : '📂 打开文件' }}
              </n-button>
            </n-upload>
            <!-- URL 加载 -->
            <n-input
              v-model:value="urlInput"
              placeholder="输入点云 URL (.bin/.pcd)"
              size="small"
              style="width: 280px"
              @keydown.enter="loadFromURL"
            />
            <n-button size="small" :loading="isLoading" @click="loadFromURL">加载 URL</n-button>
            <!-- 导出 -->
            <n-button size="small" @click="exportAnnotations">💾 导出标注</n-button>
            <n-button size="small" @click="exportZip">📦 导出 ZIP</n-button>
          </div>
        </div>

        <!-- 主内容区 -->
        <div class="content-area">
          <!-- 左侧工具栏 -->
          <ToolBar
            :active-tool="activeTool"
            :color-mode="colorMode"
            :point-size="pointSize"
            :can-undo="canUndo"
            :can-redo="canRedo"
            @tool-change="setActiveTool"
            @view-change="setPresetView"
            @reset-view="resetView"
            @color-mode-change="setColorMode"
            @point-size-change="setPointSize"
            @undo="undo"
            @redo="redo"
          />

          <!-- 中央视图 -->
          <div class="viewer-area">
            <PointCloudCanvas
              ref="canvasComponent"
              :point-cloud="pointCloud"
              :color-mode="colorMode"
              :point-size="pointSize"
              @scene-ready="onSceneReady"
            />
          </div>

          <!-- 右侧面板 -->
          <div class="right-panel">
            <n-scrollbar style="height: 100%">
              <AnnotationList
                :boxes="boundingBoxes"
                :selected-box-id="selectedBox?.id ?? null"
                @select="selectBox"
                @delete="deleteBox"
              />
              <n-divider />
              <BoxProperties
                :box="selectedBox"
                :categories="labelManager.categories"
                @update="updateSelectedBox"
              />
              <n-divider />
              <LabelColorPicker
                :categories="labelManager.categories"
                :active-category-id="activeCategoryId"
                @select-category="activeCategoryId = $event"
                @color-change="updateCategoryColor"
              />
              <n-divider />
              <!-- 性能基准测试面板 -->
              <BenchmarkPanel
                :current-fps="currentFps"
                :on-load-test-cloud="loadTestCloud"
              />
            </n-scrollbar>
          </div>
        </div>

        <!-- 底部帧导航 -->
        <div class="bottom-bar">
          <FrameNavigator
            :frames="frames"
            :current-frame-id="currentFrame?.id ?? null"
            @switch-frame="switchFrame"
            @add-frame="showAddFrameDialog"
          />
        </div>

        <!-- 错误提示 -->
        <n-alert v-if="loadError" type="error" closable style="position:fixed;bottom:80px;right:16px;z-index:100;max-width:400px" @close="loadError = null">
          {{ loadError }}
        </n-alert>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  NConfigProvider, NMessageProvider, NButton, NUpload, NInput,
  NDivider, NScrollbar, NAlert, darkTheme,
} from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import ToolBar from './ToolBar.vue'
import PointCloudCanvas from './PointCloudCanvas.vue'
import AnnotationList from './AnnotationList.vue'
import BoxProperties from './BoxProperties.vue'
import LabelColorPicker from './LabelColorPicker.vue'
import FrameNavigator from './FrameNavigator.vue'
import BenchmarkPanel from './BenchmarkPanel.vue'
import { usePointCloud } from '@/composables/usePointCloud'
import { useAnnotation } from '@/composables/useAnnotation'
import { useProject } from '@/composables/useProject'
import { LabelManager } from '@/core/Annotation/LabelManager'
import type { BoundingBox3D, ColorMode, ToolType } from '@/types'
import type { useScene } from '@/composables/useScene'

// ── State ──────────────────────────────────────────────────────────────────
const canvasComponent = ref<InstanceType<typeof PointCloudCanvas> | null>(null)
const urlInput = ref('')
const loadError = ref<string | null>(null)
const activeCategoryId = ref(1)
const colorMode = ref<ColorMode>('intensity')
const pointSize = ref(2.0)
const currentFps = ref(0)

// ── Composables ────────────────────────────────────────────────────────────
const { isLoading, progress, error: pcError, pointCloud, loadFile, loadURL: loadURLFn } = usePointCloud()
const { currentFrame, frames, switchFrame: switchFrameFn, restoreLastProject, exportZip: exportZipFn, addFrame: addFrameFn } = useProject()
const labelManager = new LabelManager()

// Scene ref (set after canvas mounts)
let sceneRef: ReturnType<typeof useScene> | null = null

const annotation = useAnnotation(
  () => sceneRef?.getCamera() ?? null,
  () => canvasComponent.value?.canvasRef ?? null,
  () => sceneRef?.getScene() ?? null,
  labelManager
)

const {
  activeTool, boundingBoxes, selectedBox, canUndo, canRedo,
  initTools, setActiveTool, updatePositions, undo, redo,
  deleteSelectedBox, updateSelectedBox: updateSelectedBoxFn, clearAnnotations,
} = annotation

// ── Scene ready ────────────────────────────────────────────────────────────
function onSceneReady(scene: ReturnType<typeof useScene>): void {
  sceneRef = scene
  initTools()

  // 注册语义颜色同步回调（任务 16）
  labelManager.onColorsUpdate((colors) => {
    if (colorMode.value === 'semantic') {
      sceneRef?.updateSemanticColors(colors)
    }
  })

  // 同步 FPS 到本地 ref（供 BenchmarkPanel 使用）
  setInterval(() => {
    currentFps.value = sceneRef?.fps ?? 0
  }, 500)
}

/** 基准测试：加载生成的测试点云到渲染器 */
function loadTestCloud(positions: Float32Array, intensities: Float32Array, count: number): void {
  if (!sceneRef) return
  sceneRef.loadPointCloud({ positions, intensities, count })
  labelManager.initPointLabels(count)
  updatePositions(positions)
  clearAnnotations()
}

// ── Point cloud loading ────────────────────────────────────────────────────
function handleFileUpload(data: { file: UploadFileInfo }): void {
  if (data.file.file) {
    loadFile(data.file.file)
  }
}

async function loadFromURL(): Promise<void> {
  if (!urlInput.value.trim()) return
  await loadURLFn(urlInput.value.trim())
}

watch(pcError, (err) => {
  if (err) loadError.value = err
})

watch(pointCloud, (data) => {
  if (data && sceneRef) {
    sceneRef.loadPointCloud(data)
    labelManager.initPointLabels(data.count)
    updatePositions(data.positions)
    clearAnnotations()
  }
})

// ── Color / size ───────────────────────────────────────────────────────────
function setColorMode(mode: ColorMode): void {
  colorMode.value = mode
  sceneRef?.setColorMode(mode)
}

function setPointSize(size: number): void {
  pointSize.value = size
  sceneRef?.setPointSize(size)
}

// ── View controls ──────────────────────────────────────────────────────────
function setPresetView(view: 'top' | 'front' | 'side'): void {
  sceneRef?.setPresetView(view)
}

function resetView(): void {
  sceneRef?.resetView()
}

// ── Annotation ─────────────────────────────────────────────────────────────
function selectBox(id: string): void {
  // BoundingBoxTool handles selection internally; just sync
  const box = boundingBoxes.value.find(b => b.id === id)
  if (box) selectedBox.value = box
}

function deleteBox(id: string): void {
  const box = boundingBoxes.value.find(b => b.id === id)
  if (box && selectedBox.value?.id === id) {
    deleteSelectedBox()
  }
}

function updateSelectedBox(updates: Partial<BoundingBox3D>): void {
  updateSelectedBoxFn(updates)
}

function updateCategoryColor(id: number, color: string): void {
  const cat = labelManager.categories.find(c => c.id === id)
  if (cat) {
    cat.color = color
    if (colorMode.value === 'semantic') {
      sceneRef?.updateSemanticColors(labelManager.buildSemanticColors())
    }
  }
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportAnnotations(): void {
  const json = labelManager.exportBoundingBoxesJSON(
    boundingBoxes.value,
    currentFrame.value?.id ?? 'frame-0'
  )
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'annotations.json'
  a.click()
  URL.revokeObjectURL(url)
}

async function exportZip(): Promise<void> {
  await exportZipFn()
}

// ── Frame navigation ───────────────────────────────────────────────────────
function switchFrame(frameId: string): void {
  const frame = switchFrameFn(frameId)
  // 自动加载帧对应的点云数据（任务 17.2）
  if (frame?.url) {
    loadURLFn(frame.url)
  }
  // 恢复帧的标注数据
  if (frame) {
    boundingBoxes.value = [...frame.boundingBoxes]
    labelManager.restoreFromFrame(frame, 0)
  }
}

function showAddFrameDialog(): void {
  const url = window.prompt('输入帧 URL (.bin 或 .pcd):')
  if (!url) return
  const name = url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? `frame-${frames.value.length + 1}`
  addFrameFn(url, name)
}

// ── Fullscreen ─────────────────────────────────────────────────────────────
function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'F11') {
    e.preventDefault()
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }
}

onMounted(() => {
  restoreLastProject()
  window.addEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.main-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #13131f;
  color: #ddd;
  overflow: hidden;
}
.top-bar {
  height: 48px;
  background: #1e1e2e;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  flex-shrink: 0;
}
.app-title {
  font-size: 14px;
  font-weight: 700;
  color: #4a9eff;
  white-space: nowrap;
  margin-right: 8px;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.viewer-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.right-panel {
  width: 220px;
  background: #1e1e2e;
  border-left: 1px solid #333;
  flex-shrink: 0;
  overflow: hidden;
}
.bottom-bar {
  height: 56px;
  flex-shrink: 0;
}
</style>
