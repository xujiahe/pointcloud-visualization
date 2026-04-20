import { AnnotationHistory } from '../Annotation/AnnotationHistory'
import { AddBoundingBoxCommand, DeleteBoundingBoxCommandWithSnapshot, UpdateBoundingBoxCommand } from '../Annotation/commands/BoundingBoxCommands'
import { LabelPointsCommand } from '../Annotation/commands/LabelPointsCommand'
import type { BoundingBox3D } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBox(overrides: Partial<BoundingBox3D> = {}): BoundingBox3D {
  return {
    id: 'box-1',
    label: 'Car',
    center: [1, 2, 3],
    size: [4, 2, 1.5],
    rotation: 0.5,
    color: '#FF4444',
    ...overrides,
  }
}

// ─── AnnotationHistory 基础功能 ──────────────────────────────────────────────

describe('AnnotationHistory', () => {
  it('初始状态 canUndo 为 false，canRedo 为 false', () => {
    const history = new AnnotationHistory()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('execute 后 canUndo 为 true，canRedo 为 false', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    const cmd = new AddBoundingBoxCommand(boxes, makeBox())
    history.execute(cmd)
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)
  })

  it('undo 后 canUndo 可能为 false，canRedo 为 true', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    history.execute(new AddBoundingBoxCommand(boxes, makeBox()))
    history.undo()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('redo 后 canRedo 为 false', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    history.execute(new AddBoundingBoxCommand(boxes, makeBox()))
    history.undo()
    history.redo()
    expect(history.canRedo).toBe(false)
  })

  it('clear 后 canUndo 和 canRedo 均为 false', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    history.execute(new AddBoundingBoxCommand(boxes, makeBox()))
    history.undo()
    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('超过 50 步历史时，最旧的记录被移除（undoCount 不超过 50）', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    // 执行 55 次命令
    for (let i = 0; i < 55; i++) {
      history.execute(new AddBoundingBoxCommand(boxes, makeBox({ id: `box-${i}` })))
    }
    expect(history.undoCount).toBe(50)
  })
})

// ─── AddBoundingBoxCommand ───────────────────────────────────────────────────

describe('AddBoundingBoxCommand', () => {
  it('execute 后 boxes 数组包含新包围盒', () => {
    const boxes: BoundingBox3D[] = []
    const box = makeBox({ id: 'new-box' })
    const cmd = new AddBoundingBoxCommand(boxes, box)
    cmd.execute()
    expect(boxes).toHaveLength(1)
    expect(boxes[0].id).toBe('new-box')
  })

  it('undo 后 boxes 数组不包含该包围盒', () => {
    const boxes: BoundingBox3D[] = []
    const box = makeBox({ id: 'new-box' })
    const cmd = new AddBoundingBoxCommand(boxes, box)
    cmd.execute()
    cmd.undo()
    expect(boxes).toHaveLength(0)
  })

  it('通过 AnnotationHistory 执行和撤销', () => {
    const history = new AnnotationHistory()
    const boxes: BoundingBox3D[] = []
    const box = makeBox({ id: 'hist-box' })
    history.execute(new AddBoundingBoxCommand(boxes, box))
    expect(boxes).toHaveLength(1)
    history.undo()
    expect(boxes).toHaveLength(0)
  })
})

// ─── DeleteBoundingBoxCommandWithSnapshot ────────────────────────────────────

describe('DeleteBoundingBoxCommandWithSnapshot', () => {
  it('execute 后 boxes 数组不包含该包围盒', () => {
    const box = makeBox({ id: 'del-box' })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new DeleteBoundingBoxCommandWithSnapshot(boxes, 'del-box')
    cmd.execute()
    expect(boxes).toHaveLength(0)
  })

  it('undo 后 boxes 数组恢复包含该包围盒', () => {
    const box = makeBox({ id: 'del-box' })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new DeleteBoundingBoxCommandWithSnapshot(boxes, 'del-box')
    cmd.execute()
    cmd.undo()
    expect(boxes).toHaveLength(1)
    expect(boxes[0].id).toBe('del-box')
  })

  it('undo 后恢复的包围盒位置和内容与原始一致', () => {
    const box = makeBox({ id: 'del-box', center: [10, 20, 30], label: 'Pedestrian' })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new DeleteBoundingBoxCommandWithSnapshot(boxes, 'del-box')
    cmd.execute()
    cmd.undo()
    expect(boxes[0].center).toEqual([10, 20, 30])
    expect(boxes[0].label).toBe('Pedestrian')
  })

  it('undo 后包围盒恢复到原始位置（数组索引）', () => {
    const box0 = makeBox({ id: 'box-0' })
    const box1 = makeBox({ id: 'box-1' })
    const box2 = makeBox({ id: 'box-2' })
    const boxes: BoundingBox3D[] = [box0, box1, box2]
    const cmd = new DeleteBoundingBoxCommandWithSnapshot(boxes, 'box-1')
    cmd.execute()
    expect(boxes).toHaveLength(2)
    cmd.undo()
    expect(boxes).toHaveLength(3)
    expect(boxes[1].id).toBe('box-1')
  })
})

// ─── UpdateBoundingBoxCommand ────────────────────────────────────────────────

describe('UpdateBoundingBoxCommand', () => {
  it('execute 后包围盒属性更新', () => {
    const box = makeBox({ id: 'upd-box', label: 'Car' })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new UpdateBoundingBoxCommand(boxes, 'upd-box', { label: 'Pedestrian' })
    cmd.execute()
    expect(box.label).toBe('Pedestrian')
  })

  it('undo 后包围盒属性恢复', () => {
    const box = makeBox({ id: 'upd-box', label: 'Car' })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new UpdateBoundingBoxCommand(boxes, 'upd-box', { label: 'Pedestrian' })
    cmd.execute()
    cmd.undo()
    expect(box.label).toBe('Car')
  })

  it('可以更新多个属性，undo 后全部恢复', () => {
    const box = makeBox({ id: 'upd-box', label: 'Car', rotation: 0.5 })
    const boxes: BoundingBox3D[] = [box]
    const cmd = new UpdateBoundingBoxCommand(boxes, 'upd-box', {
      label: 'Cyclist',
      rotation: 1.2,
    })
    cmd.execute()
    expect(box.label).toBe('Cyclist')
    expect(box.rotation).toBeCloseTo(1.2)
    cmd.undo()
    expect(box.label).toBe('Car')
    expect(box.rotation).toBeCloseTo(0.5)
  })

  it('包围盒不存在时构造函数抛出错误', () => {
    const boxes: BoundingBox3D[] = []
    expect(() => new UpdateBoundingBoxCommand(boxes, 'nonexistent', { label: 'Car' })).toThrow()
  })
})

// ─── LabelPointsCommand ──────────────────────────────────────────────────────

describe('LabelPointsCommand', () => {
  it('execute 后指定点的标签更新', () => {
    const labels = new Uint32Array([0, 0, 0, 0, 0])
    const cmd = new LabelPointsCommand(labels, [1, 3], 2)
    cmd.execute()
    expect(labels[1]).toBe(2)
    expect(labels[3]).toBe(2)
    // 未指定的点不变
    expect(labels[0]).toBe(0)
    expect(labels[2]).toBe(0)
    expect(labels[4]).toBe(0)
  })

  it('undo 后指定点的标签恢复', () => {
    const labels = new Uint32Array([0, 1, 0, 3, 0])
    const cmd = new LabelPointsCommand(labels, [1, 3], 5)
    cmd.execute()
    expect(labels[1]).toBe(5)
    expect(labels[3]).toBe(5)
    cmd.undo()
    expect(labels[1]).toBe(1)
    expect(labels[3]).toBe(3)
  })

  it('通过 AnnotationHistory 执行和撤销', () => {
    const history = new AnnotationHistory()
    const labels = new Uint32Array([0, 0, 0])
    history.execute(new LabelPointsCommand(labels, [0, 2], 4))
    expect(labels[0]).toBe(4)
    expect(labels[2]).toBe(4)
    history.undo()
    expect(labels[0]).toBe(0)
    expect(labels[2]).toBe(0)
  })

  it('多次 execute 只记录首次执行前的旧标签', () => {
    const labels = new Uint32Array([0, 0, 0])
    const cmd = new LabelPointsCommand(labels, [0], 1)
    cmd.execute()          // labels[0] = 1，记录旧值 0
    labels[0] = 99         // 模拟外部修改
    cmd.execute()          // 再次执行，不应覆盖已记录的旧值
    cmd.undo()
    expect(labels[0]).toBe(0) // 恢复到首次执行前的值
  })
})
