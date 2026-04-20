import { ref, readonly, onUnmounted } from 'vue'
import { PointCloudRenderer } from '@/core/Renderer/PointCloudRenderer'
import { SceneController } from '@/core/Renderer/SceneController'
import type { ParsedPointCloud, ColorMode } from '@/types'
import type * as THREE from 'three'

export function useScene() {
  const renderer = new PointCloudRenderer()
  let controller: SceneController | null = null

  const fps = ref(0)
  const renderedPointCount = ref(0)
  const totalPointCount = ref(0)
  const colorMode = ref<ColorMode>('intensity')
  const pointSize = ref(2.0)
  const performanceDegraded = ref(false)

  let statsInterval: ReturnType<typeof setInterval> | null = null

  function initScene(canvas: HTMLCanvasElement): void {
    renderer.init(canvas)
    controller = new SceneController(renderer.getCamera(), renderer.getControls())

    // 定期更新性能统计
    statsInterval = setInterval(() => {
      fps.value = renderer.fps
      renderedPointCount.value = renderer.renderedPointCount
      totalPointCount.value = renderer.totalPointCount
      performanceDegraded.value = renderer.performanceDegraded
    }, 200)
  }

  function loadPointCloud(data: ParsedPointCloud): void {
    renderer.loadPointCloud(data)
    totalPointCount.value = data.count
  }

  function setColorMode(mode: ColorMode): void {
    colorMode.value = mode
    renderer.setColorMode(mode)
  }

  function setPointSize(size: number): void {
    pointSize.value = size
    renderer.setPointSize(size)
  }

  function setPresetView(view: 'top' | 'front' | 'side'): void {
    controller?.setPresetView(view)
  }

  function resetView(): void {
    controller?.resetView()
  }

  function focusOnPoint(worldPosition: THREE.Vector3): void {
    controller?.focusOnPoint(worldPosition)
  }

  function resizeRenderer(width: number, height: number): void {
    renderer.resize(width, height)
  }

  function updateSemanticColors(colors: Float32Array): void {
    renderer.updateSemanticColors(colors)
  }

  function getCamera(): THREE.PerspectiveCamera | null {
    try { return renderer.getCamera() } catch { return null }
  }

  function getScene(): THREE.Scene | null {
    try { return renderer.getScene() } catch { return null }
  }

  onUnmounted(() => {
    if (statsInterval) clearInterval(statsInterval)
    renderer.dispose()
  })

  return {
    fps: readonly(fps),
    renderedPointCount: readonly(renderedPointCount),
    totalPointCount: readonly(totalPointCount),
    colorMode,
    pointSize,
    performanceDegraded: readonly(performanceDegraded),
    initScene,
    loadPointCloud,
    setColorMode,
    setPointSize,
    setPresetView,
    resetView,
    focusOnPoint,
    resizeRenderer,
    updateSemanticColors,
    getCamera,
    getScene,
  }
}
