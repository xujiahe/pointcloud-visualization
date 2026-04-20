import * as THREE from 'three'
import { AnnotationHistory } from '../AnnotationHistory'
import { LabelPointsCommand } from '../commands/LabelPointsCommand'

interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export class RectSelectTool {
  private history: AnnotationHistory
  private pointLabels: Uint32Array
  private positions: Float32Array
  private camera: THREE.Camera
  private canvas: HTMLCanvasElement

  private activeCategoryId = 1
  private isSelecting = false
  private startScreen: { x: number; y: number } | null = null
  private overlayEl: HTMLDivElement | null = null

  private onLabelsChanged?: (indices: number[]) => void

  constructor(
    history: AnnotationHistory,
    pointLabels: Uint32Array,
    positions: Float32Array,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement
  ) {
    this.history = history
    this.pointLabels = pointLabels
    this.positions = positions
    this.camera = camera
    this.canvas = canvas
  }

  setCategoryId(id: number): void { this.activeCategoryId = id }
  onLabelsChange(callback: (indices: number[]) => void): void {
    this.onLabelsChanged = callback
  }

  activate(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown)
    this.canvas.addEventListener('mousemove', this.handleMouseMove)
    this.canvas.addEventListener('mouseup', this.handleMouseUp)
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown)
    this.canvas.removeEventListener('mousemove', this.handleMouseMove)
    this.canvas.removeEventListener('mouseup', this.handleMouseUp)
    this.removeOverlay()
    this.isSelecting = false
  }

  /**
   * 选取屏幕矩形内的所有点（NDC 坐标矩形）
   */
  selectPointsInRect(ndcRect: { minX: number; minY: number; maxX: number; maxY: number }): number[] {
    const count = Math.floor(this.positions.length / 3)
    const selected: number[] = []
    const point = new THREE.Vector3()

    for (let i = 0; i < count; i++) {
      point.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      )
      // 投影到 NDC
      point.project(this.camera)
      if (
        point.x >= ndcRect.minX && point.x <= ndcRect.maxX &&
        point.y >= ndcRect.minY && point.y <= ndcRect.maxY
      ) {
        selected.push(i)
      }
    }
    return selected
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return
    this.isSelecting = true
    this.startScreen = { x: e.clientX, y: e.clientY }
    this.createOverlay(e.clientX, e.clientY)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isSelecting || !this.startScreen || !this.overlayEl) return
    const rect = this.getScreenRect(this.startScreen, { x: e.clientX, y: e.clientY })
    this.overlayEl.style.left   = `${rect.x}px`
    this.overlayEl.style.top    = `${rect.y}px`
    this.overlayEl.style.width  = `${rect.width}px`
    this.overlayEl.style.height = `${rect.height}px`
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isSelecting || !this.startScreen) return
    this.isSelecting = false
    this.removeOverlay()

    const canvasRect = this.canvas.getBoundingClientRect()
    const toNDC = (clientX: number, clientY: number) => ({
      x: ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      y: -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
    })

    const start = toNDC(this.startScreen.x, this.startScreen.y)
    const end   = toNDC(e.clientX, e.clientY)

    const ndcRect = {
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxY: Math.max(start.y, end.y),
    }

    const indices = this.selectPointsInRect(ndcRect)
    if (indices.length > 0) {
      const cmd = new LabelPointsCommand(this.pointLabels, indices, this.activeCategoryId)
      this.history.execute(cmd)
      this.onLabelsChanged?.(indices)
    }

    this.startScreen = null
  }

  private createOverlay(x: number, y: number): void {
    this.removeOverlay()
    const div = document.createElement('div')
    div.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 0;
      height: 0;
      border: 1px dashed #00ff00;
      background: rgba(0, 255, 0, 0.05);
      pointer-events: none;
      z-index: 9999;
    `
    document.body.appendChild(div)
    this.overlayEl = div
  }

  private removeOverlay(): void {
    if (this.overlayEl) {
      document.body.removeChild(this.overlayEl)
      this.overlayEl = null
    }
  }

  private getScreenRect(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): ScreenRect {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    }
  }
}
