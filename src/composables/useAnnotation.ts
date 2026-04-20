import { ref, computed, shallowRef, onMounted, onUnmounted } from 'vue'
import { AnnotationHistory } from '@/core/Annotation/AnnotationHistory'
import { BoundingBoxTool } from '@/core/Annotation/tools/BoundingBoxTool'
import { SemanticBrushTool } from '@/core/Annotation/tools/SemanticBrushTool'
import { RectSelectTool } from '@/core/Annotation/tools/RectSelectTool'
import { LabelManager } from '@/core/Annotation/LabelManager'
import type { BoundingBox3D, ToolType } from '@/types'
import type * as THREE from 'three'

export function useAnnotation(
  camera: () => THREE.Camera | null,
  canvas: () => HTMLCanvasElement | null,
  scene: () => THREE.Scene | null,
  labelManager: LabelManager
) {
  const history = new AnnotationHistory()
  const activeTool = ref<ToolType>('select')
  const boundingBoxes = ref<BoundingBox3D[]>([])
  const selectedBox = shallowRef<BoundingBox3D | null>(null)
  const canUndo = computed(() => history.canUndo)
  const canRedo = computed(() => history.canRedo)

  let bbTool: BoundingBoxTool | null = null
  let brushTool: SemanticBrushTool | null = null
  let rectTool: RectSelectTool | null = null

  function initTools(): void {
    const cam = camera()
    const cvs = canvas()
    const scn = scene()
    if (!cam || !cvs || !scn) return

    bbTool = new BoundingBoxTool(history, boundingBoxes.value, cam, cvs, scn)
    bbTool.onSelectionChange(box => { selectedBox.value = box })
    bbTool.onBoxesChange(boxes => { boundingBoxes.value = [...boxes] })

    brushTool = new SemanticBrushTool(
      history,
      labelManager.pointLabels,
      new Float32Array(0),
      cam,
      cvs
    )
    brushTool.onLabelsChange(() => {
      // 触发颜色更新
    })

    rectTool = new RectSelectTool(
      history,
      labelManager.pointLabels,
      new Float32Array(0),
      cam,
      cvs
    )
  }

  function setActiveTool(tool: ToolType): void {
    // 停用当前工具
    bbTool?.deactivate()
    brushTool?.deactivate()
    rectTool?.deactivate()

    activeTool.value = tool

    // 激活新工具
    switch (tool) {
      case 'boundingbox': bbTool?.activate(); break
      case 'brush':       brushTool?.activate(); break
      case 'rectselect':  rectTool?.activate(); break
    }
  }

  function updatePositions(positions: Float32Array): void {
    if (brushTool) {
      // 重新创建工具以更新 positions 引用
      const cam = camera()
      const cvs = canvas()
      if (cam && cvs) {
        const wasActive = activeTool.value === 'brush'
        brushTool.deactivate()
        brushTool = new SemanticBrushTool(
          history, labelManager.pointLabels, positions, cam, cvs
        )
        if (wasActive) brushTool.activate()
      }
    }
    if (rectTool) {
      const cam = camera()
      const cvs = canvas()
      if (cam && cvs) {
        const wasActive = activeTool.value === 'rectselect'
        rectTool.deactivate()
        rectTool = new RectSelectTool(
          history, labelManager.pointLabels, positions, cam, cvs
        )
        if (wasActive) rectTool.activate()
      }
    }
  }

  function undo(): void { history.undo() }
  function redo(): void { history.redo() }

  function deleteSelectedBox(): void {
    bbTool?.deleteSelected()
  }

  function updateSelectedBox(updates: Partial<BoundingBox3D>): void {
    bbTool?.updateSelected(updates)
  }

  function clearAnnotations(): void {
    boundingBoxes.value = []
    history.clear()
    selectedBox.value = null
  }

  // 全局键盘快捷键
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault()
      redo()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelectedBox()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    bbTool?.deactivate()
    brushTool?.deactivate()
    rectTool?.deactivate()
  })

  return {
    activeTool,
    boundingBoxes,
    selectedBox,
    canUndo,
    canRedo,
    initTools,
    setActiveTool,
    updatePositions,
    undo,
    redo,
    deleteSelectedBox,
    updateSelectedBox,
    clearAnnotations,
  }
}
