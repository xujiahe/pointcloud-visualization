import type { Command } from '../AnnotationHistory'

/**
 * 为点分配语义标签的命令
 */
export class LabelPointsCommand implements Command {
  private pointLabels: Uint32Array
  private pointIndices: number[]
  private newCategoryId: number
  private previousLabels: Map<number, number> = new Map()

  constructor(pointLabels: Uint32Array, pointIndices: number[], newCategoryId: number) {
    this.pointLabels = pointLabels
    this.pointIndices = pointIndices
    this.newCategoryId = newCategoryId
  }

  execute(): void {
    for (const idx of this.pointIndices) {
      // 记录旧标签（仅首次执行时记录）
      if (!this.previousLabels.has(idx)) {
        this.previousLabels.set(idx, this.pointLabels[idx])
      }
      this.pointLabels[idx] = this.newCategoryId
    }
  }

  undo(): void {
    for (const [idx, oldLabel] of this.previousLabels) {
      this.pointLabels[idx] = oldLabel
    }
  }
}
