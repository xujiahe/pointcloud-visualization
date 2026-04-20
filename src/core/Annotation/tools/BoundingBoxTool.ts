import * as THREE from 'three'
import type { BoundingBox3D } from '@/types'
import { AnnotationHistory } from '../AnnotationHistory'
import {
  AddBoundingBoxCommand,
  DeleteBoundingBoxCommandWithSnapshot,
  UpdateBoundingBoxCommand,
} from '../commands/BoundingBoxCommands'

export class BoundingBoxTool {
  private history: AnnotationHistory
  private boxes: BoundingBox3D[]
  private camera: THREE.Camera
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene

  // 当前选中的包围盒
  private selectedBoxId: string | null = null
  private onSelectionChanged?: (box: BoundingBox3D | null) => void
  private onBoxesChanged?: (boxes: BoundingBox3D[]) => void

  // 拖拽创建状态
  private isDragging = false
  private dragStartWorld: THREE.Vector3 | null = null
  private previewMesh: THREE.LineSegments | null = null

  // 包围盒 mesh 映射
  private boxMeshes = new Map<string, THREE.LineSegments>()

  // Raycaster
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()

  constructor(
    history: AnnotationHistory,
    boxes: BoundingBox3D[],
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    scene: THREE.Scene
  ) {
    this.history = history
    this.boxes = boxes
    this.camera = camera
    this.canvas = canvas
    this.scene = scene
  }

  onSelectionChange(callback: (box: BoundingBox3D | null) => void): void {
    this.onSelectionChanged = callback
  }

  onBoxesChange(callback: (boxes: BoundingBox3D[]) => void): void {
    this.onBoxesChanged = callback
  }

  /**
   * 激活工具（绑定事件）
   */
  activate(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown)
    this.canvas.addEventListener('mousemove', this.handleMouseMove)
    this.canvas.addEventListener('mouseup', this.handleMouseUp)
    this.canvas.addEventListener('click', this.handleClick)
  }

  /**
   * 停用工具（解绑事件）
   */
  deactivate(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown)
    this.canvas.removeEventListener('mousemove', this.handleMouseMove)
    this.canvas.removeEventListener('mouseup', this.handleMouseUp)
    this.canvas.removeEventListener('click', this.handleClick)
    this.clearPreview()
  }

  /**
   * 删除选中的包围盒
   */
  deleteSelected(): void {
    if (!this.selectedBoxId) return
    const cmd = new DeleteBoundingBoxCommandWithSnapshot(this.boxes, this.selectedBoxId)
    this.history.execute(cmd)
    this.removeMesh(this.selectedBoxId)
    this.selectedBoxId = null
    this.onSelectionChanged?.(null)
    this.onBoxesChanged?.(this.boxes)
  }

  /**
   * 更新选中包围盒的属性
   */
  updateSelected(updates: Partial<BoundingBox3D>): void {
    if (!this.selectedBoxId) return
    const cmd = new UpdateBoundingBoxCommand(this.boxes, this.selectedBoxId, updates)
    this.history.execute(cmd)
    this.refreshMesh(this.selectedBoxId)
    this.onBoxesChanged?.(this.boxes)
  }

  /**
   * 重新渲染所有包围盒（加载新帧时调用）
   */
  refreshAll(): void {
    // 清除旧 mesh
    for (const [, mesh] of this.boxMeshes) {
      this.scene.remove(mesh)
    }
    this.boxMeshes.clear()
    // 重建
    for (const box of this.boxes) {
      this.addMesh(box)
    }
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return
    this.isDragging = false
    this.dragStartWorld = this.screenToGround(e)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.dragStartWorld || e.buttons !== 1) return
    this.isDragging = true
    const current = this.screenToGround(e)
    if (!current) return
    this.updatePreview(this.dragStartWorld, current)
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return
    if (this.isDragging && this.dragStartWorld) {
      const endWorld = this.screenToGround(e)
      if (endWorld) {
        this.createBox(this.dragStartWorld, endWorld)
      }
    }
    this.isDragging = false
    this.dragStartWorld = null
    this.clearPreview()
  }

  private handleClick = (e: MouseEvent): void => {
    if (this.isDragging) return
    this.updateMouse(e)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    // 检测点击了哪个包围盒
    const meshes = Array.from(this.boxMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes)

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.LineSegments
      const boxId = this.getMeshBoxId(mesh)
      if (boxId) {
        this.selectBox(boxId)
        return
      }
    }

    // 点击空白处取消选中
    this.selectedBoxId = null
    this.onSelectionChanged?.(null)
  }

  private createBox(start: THREE.Vector3, end: THREE.Vector3): void {
    const center: [number, number, number] = [
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      1.0, // 默认高度中心
    ]
    const size: [number, number, number] = [
      Math.abs(end.x - start.x) || 0.5,
      Math.abs(end.y - start.y) || 0.5,
      2.0, // 默认高度
    ]

    const box: BoundingBox3D = {
      id: crypto.randomUUID(),
      center,
      size,
      rotation: 0,
      label: 'Car',
      color: '#FF4444',
    }

    const cmd = new AddBoundingBoxCommand(this.boxes, box)
    this.history.execute(cmd)
    this.addMesh(box)
    this.selectBox(box.id)
    this.onBoxesChanged?.(this.boxes)
  }

  private selectBox(boxId: string): void {
    this.selectedBoxId = boxId
    const box = this.boxes.find(b => b.id === boxId) ?? null
    this.onSelectionChanged?.(box)
  }

  private addMesh(box: BoundingBox3D): void {
    const mesh = this.createBoxMesh(box)
    this.boxMeshes.set(box.id, mesh)
    this.scene.add(mesh)
  }

  private removeMesh(boxId: string): void {
    const mesh = this.boxMeshes.get(boxId)
    if (mesh) {
      this.scene.remove(mesh)
      this.boxMeshes.delete(boxId)
    }
  }

  private refreshMesh(boxId: string): void {
    this.removeMesh(boxId)
    const box = this.boxes.find(b => b.id === boxId)
    if (box) this.addMesh(box)
  }

  private createBoxMesh(box: BoundingBox3D): THREE.LineSegments {
    const [lx, ly, lz] = box.size
    const geometry = new THREE.BoxGeometry(lx, ly, lz)
    const edges = new THREE.EdgesGeometry(geometry)
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(box.color),
      linewidth: 2,
    })
    const mesh = new THREE.LineSegments(edges, material)
    mesh.position.set(...box.center)
    mesh.rotation.z = box.rotation
    return mesh
  }

  private updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
    this.clearPreview()
    const w = Math.abs(end.x - start.x) || 0.1
    const h = Math.abs(end.y - start.y) || 0.1
    const cx = (start.x + end.x) / 2
    const cy = (start.y + end.y) / 2
    const geometry = new THREE.BoxGeometry(w, h, 2)
    const edges = new THREE.EdgesGeometry(geometry)
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
    this.previewMesh = new THREE.LineSegments(edges, material)
    this.previewMesh.position.set(cx, cy, 1)
    this.scene.add(this.previewMesh)
  }

  private clearPreview(): void {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh)
      this.previewMesh = null
    }
  }

  private screenToGround(e: MouseEvent): THREE.Vector3 | null {
    this.updateMouse(e)
    this.raycaster.setFromCamera(this.mouse, this.camera)
    // 与 z=0 平面相交
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const target = new THREE.Vector3()
    const result = this.raycaster.ray.intersectPlane(plane, target)
    return result
  }

  private updateMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private getMeshBoxId(mesh: THREE.LineSegments): string | null {
    for (const [id, m] of this.boxMeshes) {
      if (m === mesh) return id
    }
    return null
  }
}
