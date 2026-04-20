import type { BoundingBox3D, SemanticCategory, ProjectData, FrameRecord } from '@/types'
import { hexToRgbNormalized } from '../Renderer/ColorMapping'

export const DEFAULT_CATEGORIES: SemanticCategory[] = [
  { id: 0, name: 'Unknown',    color: '#808080' },
  { id: 1, name: 'Car',        color: '#FF4444' },
  { id: 2, name: 'Pedestrian', color: '#44FF44' },
  { id: 3, name: 'Cyclist',    color: '#4444FF' },
  { id: 4, name: 'Road',       color: '#FFFF44' },
  { id: 5, name: 'Building',   color: '#FF8844' },
  { id: 6, name: 'Vegetation', color: '#228822' },
]

export class LabelManager {
  categories: SemanticCategory[]
  pointLabels: Uint32Array
  private onColorsChanged?: (colors: Float32Array) => void

  constructor(pointCount = 0) {
    this.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }))
    this.pointLabels = new Uint32Array(pointCount)
  }

  /**
   * 初始化点标签数组（加载新点云时调用）
   */
  initPointLabels(count: number): void {
    this.pointLabels = new Uint32Array(count)
  }

  /**
   * 注册颜色变化回调
   */
  onColorsUpdate(callback: (colors: Float32Array) => void): void {
    this.onColorsChanged = callback
  }

  /**
   * 为指定点分配语义标签
   */
  assignLabel(pointIndices: number[], categoryId: number): void {
    for (const idx of pointIndices) {
      if (idx >= 0 && idx < this.pointLabels.length) {
        this.pointLabels[idx] = categoryId
      }
    }
    this.notifyColorsChanged()
  }

  /**
   * 获取指定类别的颜色
   */
  getCategoryColor(categoryId: number): string {
    return this.categories.find(c => c.id === categoryId)?.color ?? '#808080'
  }

  /**
   * 构建语义颜色数组（供 PointCloudRenderer 使用）
   */
  buildSemanticColors(): Float32Array {
    const count = this.pointLabels.length
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const categoryId = this.pointLabels[i]
      const hex = this.getCategoryColor(categoryId)
      const [r, g, b] = hexToRgbNormalized(hex)
      colors[i * 3]     = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
    return colors
  }

  /**
   * 导出包围盒为 JSON 字符串
   */
  exportBoundingBoxesJSON(boxes: BoundingBox3D[], frameId: string): string {
    const data = {
      version: '1.0',
      frame_id: frameId,
      annotations: boxes.map(box => ({
        id: box.id,
        label: box.label,
        center: box.center,
        size: box.size,
        rotation_yaw: box.rotation,
      })),
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * 导出语义标签为二进制格式（uint32 小端序，每个点一个值）
   */
  exportSemanticLabelsBinary(): ArrayBuffer {
    const buffer = new ArrayBuffer(this.pointLabels.length * 4)
    const view = new DataView(buffer)
    for (let i = 0; i < this.pointLabels.length; i++) {
      view.setUint32(i * 4, this.pointLabels[i], true) // 小端序
    }
    return buffer
  }

  /**
   * 从项目数据导入标注
   */
  importProject(data: ProjectData): void {
    if (data.categories) {
      this.categories = data.categories.map(c => ({ ...c }))
    }
  }

  /**
   * 导出项目数据（类别配置）
   */
  exportCategories(): SemanticCategory[] {
    return this.categories.map(c => ({ ...c }))
  }

  /**
   * 导出帧的语义标签（稀疏格式，仅非 Unknown 点）
   */
  exportSparseLabels(): number[] {
    const sparse: number[] = []
    for (let i = 0; i < this.pointLabels.length; i++) {
      if (this.pointLabels[i] !== 0) {
        sparse.push(i, this.pointLabels[i])
      }
    }
    return sparse
  }

  /**
   * 从稀疏格式导入语义标签
   */
  importSparseLabels(sparse: number[], pointCount: number): void {
    this.pointLabels = new Uint32Array(pointCount)
    for (let i = 0; i < sparse.length; i += 2) {
      const idx = sparse[i]
      const label = sparse[i + 1]
      if (idx < pointCount) {
        this.pointLabels[idx] = label
      }
    }
  }

  /**
   * 从帧记录恢复标注状态
   */
  restoreFromFrame(frame: FrameRecord, pointCount: number): void {
    this.initPointLabels(pointCount)
    if (frame.semanticLabels) {
      this.importSparseLabels(frame.semanticLabels, pointCount)
    }
  }

  private notifyColorsChanged(): void {
    if (this.onColorsChanged) {
      this.onColorsChanged(this.buildSemanticColors())
    }
  }
}
