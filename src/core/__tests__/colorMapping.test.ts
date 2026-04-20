import { jetColormap, intensityToColor, heightToColor, hexToRgbNormalized } from '../Renderer/ColorMapping'

describe('colorMapping', () => {
  describe('jetColormap', () => {
    it('jetColormap(0) 输出 RGB 均在 [0,1] 范围内', () => {
      const [r, g, b] = jetColormap(0)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })

    it('jetColormap(1) 输出 RGB 均在 [0,1] 范围内', () => {
      const [r, g, b] = jetColormap(1)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })

    it('jetColormap(0.5) 输出 RGB 均在 [0,1] 范围内', () => {
      const [r, g, b] = jetColormap(0.5)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })

    it('对相同输入每次返回相同结果（纯函数）', () => {
      const result1 = jetColormap(0.3)
      const result2 = jetColormap(0.3)
      expect(result1).toEqual(result2)
    })
  })

  describe('intensityToColor', () => {
    it('输出 RGB 均在 [0,1] 范围内', () => {
      const [r, g, b] = intensityToColor(0.7, 0, 1)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })
  })

  describe('heightToColor', () => {
    it('输出 RGB 均在 [0,1] 范围内', () => {
      const [r, g, b] = heightToColor(5, 0, 10)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    })
  })

  describe('hexToRgbNormalized', () => {
    it("hexToRgbNormalized('#FF0000') 返回 [1, 0, 0]", () => {
      const [r, g, b] = hexToRgbNormalized('#FF0000')
      expect(r).toBeCloseTo(1)
      expect(g).toBeCloseTo(0)
      expect(b).toBeCloseTo(0)
    })

    it("hexToRgbNormalized('#00FF00') 返回 [0, 1, 0]", () => {
      const [r, g, b] = hexToRgbNormalized('#00FF00')
      expect(r).toBeCloseTo(0)
      expect(g).toBeCloseTo(1)
      expect(b).toBeCloseTo(0)
    })

    it("hexToRgbNormalized('#0000FF') 返回 [0, 0, 1]", () => {
      const [r, g, b] = hexToRgbNormalized('#0000FF')
      expect(r).toBeCloseTo(0)
      expect(g).toBeCloseTo(0)
      expect(b).toBeCloseTo(1)
    })
  })
})
