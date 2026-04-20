import * as fc from 'fast-check'
import { LabelManager, DEFAULT_CATEGORIES } from '../Annotation/LabelManager'
import type { BoundingBox3D, SemanticCategory, ProjectData } from '@/types'

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

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'proj-1',
    name: 'Test Project',
    frames: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    currentFrameId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe('LabelManager', () => {
  describe('constructor', () => {
    it('默认类别列表包含 7 个类别', () => {
      const lm = new LabelManager()
      expect(lm.categories).toHaveLength(7)
    })

    it('默认 pointLabels 长度为 0', () => {
      const lm = new LabelManager()
      expect(lm.pointLabels.length).toBe(0)
    })

    it('指定 pointCount 时 pointLabels 长度正确', () => {
      const lm = new LabelManager(100)
      expect(lm.pointLabels.length).toBe(100)
    })

    it('初始所有点标签为 0（Unknown）', () => {
      const lm = new LabelManager(10)
      for (let i = 0; i < 10; i++) {
        expect(lm.pointLabels[i]).toBe(0)
      }
    })
  })

  describe('initPointLabels', () => {
    it('重新初始化后长度正确', () => {
      const lm = new LabelManager(5)
      lm.initPointLabels(20)
      expect(lm.pointLabels.length).toBe(20)
    })

    it('重新初始化后所有标签为 0', () => {
      const lm = new LabelManager(5)
      lm.assignLabel([0, 1, 2], 1)
      lm.initPointLabels(5)
      for (let i = 0; i < 5; i++) {
        expect(lm.pointLabels[i]).toBe(0)
      }
    })
  })

  describe('assignLabel', () => {
    it('为指定点分配标签', () => {
      const lm = new LabelManager(10)
      lm.assignLabel([0, 3, 7], 2)
      expect(lm.pointLabels[0]).toBe(2)
      expect(lm.pointLabels[3]).toBe(2)
      expect(lm.pointLabels[7]).toBe(2)
    })

    it('越界索引被忽略', () => {
      const lm = new LabelManager(5)
      expect(() => lm.assignLabel([-1, 5, 100], 1)).not.toThrow()
      // 合法范围内的点不受影响
      for (let i = 0; i < 5; i++) {
        expect(lm.pointLabels[i]).toBe(0)
      }
    })

    it('分配标签后触发颜色回调', () => {
      const lm = new LabelManager(5)
      const callback = vi.fn()
      lm.onColorsUpdate(callback)
      lm.assignLabel([0], 1)
      expect(callback).toHaveBeenCalledOnce()
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Float32Array)
    })
  })

  describe('getCategoryColor', () => {
    it('返回已知类别的颜色', () => {
      const lm = new LabelManager()
      expect(lm.getCategoryColor(0)).toBe('#808080')
      expect(lm.getCategoryColor(1)).toBe('#FF4444')
    })

    it('未知类别返回默认灰色', () => {
      const lm = new LabelManager()
      expect(lm.getCategoryColor(999)).toBe('#808080')
    })
  })

  describe('buildSemanticColors', () => {
    it('返回长度为 count * 3 的 Float32Array', () => {
      const lm = new LabelManager(10)
      const colors = lm.buildSemanticColors()
      expect(colors).toBeInstanceOf(Float32Array)
      expect(colors.length).toBe(30)
    })

    it('所有 RGB 分量在 [0, 1] 范围内', () => {
      const lm = new LabelManager(10)
      lm.assignLabel([0, 1, 2], 1)
      const colors = lm.buildSemanticColors()
      for (let i = 0; i < colors.length; i++) {
        expect(colors[i]).toBeGreaterThanOrEqual(0)
        expect(colors[i]).toBeLessThanOrEqual(1)
      }
    })

    it('标签为 1（Car）的点颜色与 Car 类别颜色一致', () => {
      const lm = new LabelManager(3)
      lm.assignLabel([0], 1) // Car: #FF4444
      const colors = lm.buildSemanticColors()
      // #FF4444 → r=255/255=1, g=68/255≈0.267, b=68/255≈0.267
      expect(colors[0]).toBeCloseTo(255 / 255)
      expect(colors[1]).toBeCloseTo(68 / 255)
      expect(colors[2]).toBeCloseTo(68 / 255)
    })
  })

  describe('exportBoundingBoxesJSON', () => {
    it('导出 JSON 包含正确的 version 和 frame_id', () => {
      const lm = new LabelManager()
      const json = lm.exportBoundingBoxesJSON([], 'frame-001')
      const parsed = JSON.parse(json)
      expect(parsed.version).toBe('1.0')
      expect(parsed.frame_id).toBe('frame-001')
    })

    it('导出 JSON 包含正确的 annotations 数组', () => {
      const lm = new LabelManager()
      const box = makeBox()
      const json = lm.exportBoundingBoxesJSON([box], 'frame-001')
      const parsed = JSON.parse(json)
      expect(parsed.annotations).toHaveLength(1)
      const ann = parsed.annotations[0]
      expect(ann.id).toBe(box.id)
      expect(ann.label).toBe(box.label)
      expect(ann.center).toEqual(box.center)
      expect(ann.size).toEqual(box.size)
      expect(ann.rotation_yaw).toBe(box.rotation)
    })

    it('空包围盒列表导出空 annotations', () => {
      const lm = new LabelManager()
      const json = lm.exportBoundingBoxesJSON([], 'f0')
      const parsed = JSON.parse(json)
      expect(parsed.annotations).toHaveLength(0)
    })
  })

  describe('exportSemanticLabelsBinary', () => {
    it('返回 ArrayBuffer，长度为 pointCount * 4', () => {
      const lm = new LabelManager(5)
      const buf = lm.exportSemanticLabelsBinary()
      expect(buf).toBeInstanceOf(ArrayBuffer)
      expect(buf.byteLength).toBe(20)
    })

    it('二进制数据与 pointLabels 一致（小端序）', () => {
      const lm = new LabelManager(3)
      lm.assignLabel([0], 1)
      lm.assignLabel([2], 3)
      const buf = lm.exportSemanticLabelsBinary()
      const view = new DataView(buf)
      expect(view.getUint32(0, true)).toBe(1)
      expect(view.getUint32(4, true)).toBe(0)
      expect(view.getUint32(8, true)).toBe(3)
    })
  })

  describe('importProject / exportCategories', () => {
    it('importProject 更新类别列表', () => {
      const lm = new LabelManager()
      const customCategories: SemanticCategory[] = [
        { id: 0, name: 'BG', color: '#000000' },
        { id: 1, name: 'FG', color: '#FFFFFF' },
      ]
      lm.importProject(makeProject({ categories: customCategories }))
      expect(lm.categories).toHaveLength(2)
      expect(lm.categories[0].name).toBe('BG')
    })

    it('exportCategories 返回类别的深拷贝', () => {
      const lm = new LabelManager()
      const exported = lm.exportCategories()
      expect(exported).toHaveLength(lm.categories.length)
      // 修改导出结果不影响原始数据
      exported[0].name = 'Modified'
      expect(lm.categories[0].name).toBe('Unknown')
    })
  })

  describe('exportSparseLabels / importSparseLabels', () => {
    it('exportSparseLabels 仅包含非 Unknown 点', () => {
      const lm = new LabelManager(5)
      lm.assignLabel([1, 3], 2)
      const sparse = lm.exportSparseLabels()
      // 格式：[idx, label, idx, label, ...]
      expect(sparse).toEqual([1, 2, 3, 2])
    })

    it('importSparseLabels 正确恢复标签', () => {
      const lm = new LabelManager()
      lm.importSparseLabels([1, 2, 3, 2], 5)
      expect(lm.pointLabels.length).toBe(5)
      expect(lm.pointLabels[0]).toBe(0)
      expect(lm.pointLabels[1]).toBe(2)
      expect(lm.pointLabels[2]).toBe(0)
      expect(lm.pointLabels[3]).toBe(2)
      expect(lm.pointLabels[4]).toBe(0)
    })

    it('稀疏往返一致性', () => {
      const lm = new LabelManager(10)
      lm.assignLabel([0, 4, 9], 3)
      const sparse = lm.exportSparseLabels()
      const lm2 = new LabelManager()
      lm2.importSparseLabels(sparse, 10)
      for (let i = 0; i < 10; i++) {
        expect(lm2.pointLabels[i]).toBe(lm.pointLabels[i])
      }
    })
  })

  describe('restoreFromFrame', () => {
    it('无 semanticLabels 时所有点为 Unknown', () => {
      const lm = new LabelManager()
      lm.restoreFromFrame(
        { id: 'f1', name: 'f1', status: 'unlabeled', boundingBoxes: [] },
        5
      )
      expect(lm.pointLabels.length).toBe(5)
      for (let i = 0; i < 5; i++) {
        expect(lm.pointLabels[i]).toBe(0)
      }
    })

    it('有 semanticLabels 时正确恢复', () => {
      const lm = new LabelManager()
      lm.restoreFromFrame(
        {
          id: 'f1',
          name: 'f1',
          status: 'in-progress',
          boundingBoxes: [],
          semanticLabels: [2, 1, 4, 3],
        },
        5
      )
      expect(lm.pointLabels[2]).toBe(1)
      expect(lm.pointLabels[4]).toBe(3)
    })
  })
})

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('LabelManager - Property-Based Tests', () => {
  /**
   * Property 14: 语义类别颜色唯一性
   * Validates: Requirements 5.3
   */
  describe('Property 14: 语义类别颜色唯一性', () => {
    it('默认类别列表中每个类别的颜色互不相同', () => {
      fc.assert(
        fc.property(
          // 生成随机类别列表（颜色从不同的十六进制颜色中选取）
          fc.array(
            fc.record({
              id: fc.nat({ max: 255 }),
              name: fc.string({ minLength: 1, maxLength: 20 }),
              color: fc.stringMatching(/^#[0-9A-F]{6}$/),
            }),
            { minLength: 1, maxLength: 20 }
          ).filter(cats => {
            // 确保生成的类别颜色唯一（用于测试 LabelManager 导入后颜色唯一性）
            const colors = cats.map(c => c.color)
            return new Set(colors).size === colors.length
          }),
          (categories: SemanticCategory[]) => {
            const lm = new LabelManager()
            lm.importProject(makeProject({ categories }))
            const colors = lm.categories.map(c => c.color)
            const uniqueColors = new Set(colors)
            return uniqueColors.size === colors.length
          }
        ),
        { numRuns: 100 }
        // Feature: pointcloud-visualization, Property 14: 语义类别颜色唯一性
      )
    })

    it('DEFAULT_CATEGORIES 中所有颜色互不相同', () => {
      const colors = DEFAULT_CATEGORIES.map(c => c.color)
      const uniqueColors = new Set(colors)
      expect(uniqueColors.size).toBe(colors.length)
    })
  })

  /**
   * Property 11: 包围盒 JSON 导出往返一致性
   * Validates: Requirements 4.8
   */
  describe('Property 11: 包围盒 JSON 导出往返一致性', () => {
    // Arbitrary for BoundingBox3D
    const boxArb = fc.record({
      id: fc.uuid(),
      label: fc.constantFrom('Car', 'Pedestrian', 'Cyclist', 'Unknown'),
      center: fc.tuple(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ noNaN: true, noDefaultInfinity: true })
      ) as fc.Arbitrary<[number, number, number]>,
      size: fc.tuple(
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true })
      ) as fc.Arbitrary<[number, number, number]>,
      rotation: fc.float({ min: Math.fround(-Math.PI), max: Math.fround(Math.PI), noNaN: true }),
      color: fc.constantFrom('#FF4444', '#44FF44', '#4444FF', '#808080'),
    })

    it('导出后重新解析，label/center/size/rotation_yaw 与原始数据一致', () => {
      fc.assert(
        fc.property(
          fc.array(boxArb, { minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (boxes, frameId) => {
            const lm = new LabelManager()
            const json = lm.exportBoundingBoxesJSON(boxes, frameId)
            const parsed = JSON.parse(json)

            if (parsed.frame_id !== frameId) return false
            if (parsed.annotations.length !== boxes.length) return false

            return boxes.every((box, i) => {
              const ann = parsed.annotations[i]
              return (
                ann.label === box.label &&
                ann.center[0] === box.center[0] &&
                ann.center[1] === box.center[1] &&
                ann.center[2] === box.center[2] &&
                ann.size[0] === box.size[0] &&
                ann.size[1] === box.size[1] &&
                ann.size[2] === box.size[2] &&
                ann.rotation_yaw === box.rotation
              )
            })
          }
        ),
        { numRuns: 100 }
        // Feature: pointcloud-visualization, Property 11: 包围盒 JSON 导出往返一致性
      )
    })
  })

  /**
   * Property 17: 语义标签二进制导出往返一致性
   * Validates: Requirements 5.6
   */
  describe('Property 17: 语义标签二进制导出往返一致性', () => {
    it('导出为二进制后重新读取，每个点的 uint32 值与原始类别 ID 完全一致', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 6 }), { minLength: 1, maxLength: 1000 }),
          (labels) => {
            const count = labels.length
            const lm = new LabelManager(count)
            // 分配标签
            for (let i = 0; i < count; i++) {
              if (labels[i] !== 0) {
                lm.assignLabel([i], labels[i])
              }
            }
            // 导出二进制
            const buf = lm.exportSemanticLabelsBinary()
            const view = new DataView(buf)
            // 验证每个点的值
            for (let i = 0; i < count; i++) {
              const readBack = view.getUint32(i * 4, true) // 小端序
              if (readBack !== lm.pointLabels[i]) return false
            }
            return true
          }
        ),
        { numRuns: 100 }
        // Feature: pointcloud-visualization, Property 17: 语义标签二进制导出往返一致性
      )
    })
  })
})
