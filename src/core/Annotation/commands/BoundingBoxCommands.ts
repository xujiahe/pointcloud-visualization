import type { BoundingBox3D } from '@/types'
import type { Command } from '../AnnotationHistory'

/**
 * 添加包围盒命令
 */
export class AddBoundingBoxCommand implements Command {
  private boxes: BoundingBox3D[]
  private box: BoundingBox3D

  constructor(boxes: BoundingBox3D[], box: BoundingBox3D) {
    this.boxes = boxes
    this.box = box
  }

  execute(): void {
    this.boxes.push(this.box)
  }

  undo(): void {
    const idx = this.boxes.findIndex(b => b.id === this.box.id)
    if (idx !== -1) this.boxes.splice(idx, 1)
  }
}

/**
 * 删除包围盒命令
 */
export class DeleteBoundingBoxCommand implements Command {
  private boxes: BoundingBox3D[]
  private boxId: string
  private deletedIndex = -1

  constructor(boxes: BoundingBox3D[], boxId: string) {
    this.boxes = boxes
    this.boxId = boxId
  }

  execute(): void {
    this.deletedIndex = this.boxes.findIndex(b => b.id === this.boxId)
    if (this.deletedIndex !== -1) {
      this.boxes.splice(this.deletedIndex, 1)
    }
  }

  undo(): void {
    // 无法恢复已删除的包围盒，因为我们需要保存快照
    // 实际实现中需要在 execute 前保存快照
  }
}

/**
 * 删除包围盒命令（带快照）
 */
export class DeleteBoundingBoxCommandWithSnapshot implements Command {
  private boxes: BoundingBox3D[]
  private boxId: string
  private snapshot: BoundingBox3D | null = null
  private deletedIndex = -1

  constructor(boxes: BoundingBox3D[], boxId: string) {
    this.boxes = boxes
    this.boxId = boxId
  }

  execute(): void {
    this.deletedIndex = this.boxes.findIndex(b => b.id === this.boxId)
    if (this.deletedIndex !== -1) {
      this.snapshot = { ...this.boxes[this.deletedIndex] }
      this.boxes.splice(this.deletedIndex, 1)
    }
  }

  undo(): void {
    if (this.snapshot !== null && this.deletedIndex !== -1) {
      this.boxes.splice(this.deletedIndex, 0, this.snapshot)
    }
  }
}

/**
 * 更新包围盒命令
 */
export class UpdateBoundingBoxCommand implements Command {
  private previousState: Partial<BoundingBox3D>
  private box: BoundingBox3D
  private updates: Partial<BoundingBox3D>

  constructor(boxes: BoundingBox3D[], boxId: string, updates: Partial<BoundingBox3D>) {
    // 在构造时捕获当前状态快照
    const found = boxes.find(b => b.id === boxId)
    if (!found) throw new Error(`BoundingBox ${boxId} not found`)
    this.box = found
    this.updates = updates
    this.previousState = {}
    for (const key of Object.keys(updates) as (keyof BoundingBox3D)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.previousState as any)[key] = (found as any)[key]
    }
  }

  execute(): void {
    Object.assign(this.box, this.updates)
  }

  undo(): void {
    Object.assign(this.box, this.previousState)
  }
}
