import { LODManager } from '../Renderer/LODManager'

describe('LODManager', () => {
  let lod: LODManager

  beforeEach(() => {
    lod = new LODManager()
  })

  describe('isLODActive', () => {
    it('总点数 ≤ 5,000,000 时返回 false', () => {
      expect(lod.isLODActive(5_000_000)).toBe(false)
    })

    it('总点数 > 5,000,000 时返回 true', () => {
      expect(lod.isLODActive(5_000_001)).toBe(true)
    })
  })

  describe('computeRenderCount', () => {
    it('总点数 ≤ 5,000,000 且无降级时返回总点数', () => {
      expect(lod.computeRenderCount(1_000_000, false)).toBe(1_000_000)
      expect(lod.computeRenderCount(5_000_000, false)).toBe(5_000_000)
    })

    it('总点数 > 5,000,000 时返回总点数的 50%', () => {
      expect(lod.computeRenderCount(10_000_000, false)).toBe(5_000_000)
    })

    it('性能降级时额外减少 50%', () => {
      // 总点数 ≤ 阈值，仅降级：1,000,000 * 0.5 = 500,000
      expect(lod.computeRenderCount(1_000_000, true)).toBe(500_000)
      // 总点数 > 阈值，先 LOD 再降级：10,000,000 * 0.5 * 0.5 = 2,500,000
      expect(lod.computeRenderCount(10_000_000, true)).toBe(2_500_000)
    })
  })

  describe('buildLODIndex', () => {
    it('返回的索引数组长度等于 targetCount', () => {
      const indices = lod.buildLODIndex(1000, 100)
      expect(indices.length).toBe(100)
    })

    it('返回的所有索引值在 [0, totalPoints) 范围内', () => {
      const totalPoints = 1000
      const indices = lod.buildLODIndex(totalPoints, 200)
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(0)
        expect(indices[i]).toBeLessThan(totalPoints)
      }
    })

    it('buildLODIndex(n, n) 返回 0..n-1 的完整索引', () => {
      const n = 5
      const indices = lod.buildLODIndex(n, n)
      expect(indices.length).toBe(n)
      for (let i = 0; i < n; i++) {
        expect(indices[i]).toBe(i)
      }
    })
  })
})
