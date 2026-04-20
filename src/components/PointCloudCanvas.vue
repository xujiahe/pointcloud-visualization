<template>
  <div ref="containerRef" class="canvas-container">
    <div v-if="webglError" class="webgl-error">
      <n-result status="error" title="WebGL 2.0 不支持" description="您的浏览器不支持 WebGL 2.0，请使用 Chrome 56+、Firefox 51+ 或 Edge 79+ 等现代浏览器。" />
    </div>
    <canvas v-else ref="canvasRef" class="three-canvas" @dblclick="handleDblClick" />
    <FpsOverlay
      v-if="!webglError"
      :fps="fps"
      :rendered-point-count="renderedPointCount"
      :total-point-count="totalPointCount"
      :performance-degraded="performanceDegraded"
    />
    <PointTooltip
      v-if="!webglError && positions"
      :canvas="canvasRef"
      :camera="camera"
      :positions="positions"
      :intensities="intensities"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { NResult } from 'naive-ui'
import * as THREE from 'three'
import FpsOverlay from './FpsOverlay.vue'
import PointTooltip from './PointTooltip.vue'
import { useScene } from '@/composables/useScene'
import type { ParsedPointCloud, ColorMode } from '@/types'

const props = defineProps<{
  pointCloud: ParsedPointCloud | null
  colorMode: ColorMode
  pointSize: number
}>()

const emit = defineEmits<{
  sceneReady: [scene: ReturnType<typeof useScene>]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const webglError = ref(false)

const scene = useScene()
const { fps, renderedPointCount, totalPointCount, performanceDegraded } = scene

const positions = ref<Float32Array | null>(null)
const intensities = ref<Float32Array | null>(null)
const camera = ref<THREE.Camera | null>(null)

let resizeObserver: ResizeObserver | null = null

function checkWebGL(): boolean {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  return !!gl
}

onMounted(() => {
  if (!checkWebGL()) {
    webglError.value = true
    return
  }

  if (!canvasRef.value || !containerRef.value) return

  scene.initScene(canvasRef.value)
  camera.value = scene.getCamera()
  emit('sceneReady', scene)

  // ResizeObserver
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      scene.resizeRenderer(width, height)
    }
  })
  resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// 监听点云数据变化
watch(() => props.pointCloud, (data) => {
  if (data) {
    scene.loadPointCloud(data)
    positions.value = data.positions
    intensities.value = data.intensities
  }
})

// 监听颜色模式变化
watch(() => props.colorMode, (mode) => {
  scene.setColorMode(mode)
})

// 监听点大小变化
watch(() => props.pointSize, (size) => {
  scene.setPointSize(size)
})

function handleDblClick(e: MouseEvent): void {
  if (!canvasRef.value || !camera.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera.value)
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const target = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(plane, target)) {
    scene.focusOnPoint(target)
  }
}

// 暴露给父组件
defineExpose({ canvasRef, scene })
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a2e;
}
.three-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.webgl-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px;
}
</style>
