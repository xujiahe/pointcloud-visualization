import * as THREE from 'three'
import { AnnotationHistory } from '../AnnotationHistory'
import { LabelPointsCommand } from '../commands/LabelPointsCommand'

export class SemanticBrushTool {
  private history: AnnotationHistory
  private pointLabels: Uint32Array
  private positions: Float32Array
  private camera: THREE.Camera
  private canvas: HTMLCanvasElement

  private activeCategoryId = 1
  private brushRadius = 2.0  // 世界坐标单位
  private isPainting = false
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()

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
  setBrushRadius(radius: number): void { this.brushRadius = Math.max(0.1, radius) }
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
    this.isPainting = false
  }

  /**
   * 在指定世界坐标中心，选取半径内的所有点
   */
  selectPointsInRadius(center: THREE.Vector3, radius: number): number[] {
    const count = Math.floor(this.positions.length / 3)
    const selected: number[] = []
    const r2 = radius * radius

    for (let i = 0; i < count; i++) {
      const dx = this.positions[i * 3]     - center.x
      const dy = this.positions[i * 3 + 1] - center.y
      const dz = this.positions[i * 3 + 2] - center.z
      if (dx * dx + dy * dy + dz * dz <= r2) {
        selected.push(i)
      }
    }
    return selected
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return
    this.isPainting = true
    this.paint(e)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isPainting) return
    this.paint(e)
  }

  private handleMouseUp = (): void => {
    this.isPainting = false
  }

  private paint(e: MouseEvent): void {
    const worldPos = this.screenToWorld(e)
    if (!worldPos) return

    const indices = this.selectPointsInRadius(worldPos, this.brushRadius)
    if (indices.length === 0) return

    const cmd = new LabelPointsCommand(this.pointLabels, indices, this.activeCategoryId)
    this.history.execute(cmd)
    this.onLabelsChanged?.(indices)
  }

  private screenToWorld(e: MouseEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const target = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(plane, target)
  }
}
