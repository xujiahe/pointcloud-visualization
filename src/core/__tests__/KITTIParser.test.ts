import { KITTIParser } from '../Parsers/KITTIParser'

describe('KITTIParser', () => {
  let parser: KITTIParser

  beforeEach(() => {
    parser = new KITTIParser()
  })

  it('空 buffer 返回 count=0', () => {
    const result = parser.parse(new ArrayBuffer(0))
    expect(result.count).toBe(0)
    expect(result.positions.length).toBe(0)
    expect(result.intensities.length).toBe(0)
  })

  it('单点解析正确（x, y, z, intensity）', () => {
    // 1 个点 = 4 个 float32 = 16 字节
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer)
    view.setFloat32(0,  1.0, true)  // x
    view.setFloat32(4,  2.0, true)  // y
    view.setFloat32(8,  3.0, true)  // z
    view.setFloat32(12, 0.5, true)  // intensity

    const result = parser.parse(buffer)
    expect(result.count).toBe(1)
    expect(result.positions[0]).toBeCloseTo(1.0)
    expect(result.positions[1]).toBeCloseTo(2.0)
    expect(result.positions[2]).toBeCloseTo(3.0)
    expect(result.intensities[0]).toBeCloseTo(0.5)
  })

  it('多点解析正确（positions stride=3，intensities stride=1）', () => {
    // 3 个点 = 12 个 float32 = 48 字节
    const points = [
      [1.0, 2.0, 3.0, 0.1],
      [4.0, 5.0, 6.0, 0.2],
      [7.0, 8.0, 9.0, 0.3],
    ]
    const buffer = new ArrayBuffer(points.length * 16)
    const view = new DataView(buffer)
    points.forEach(([x, y, z, i], idx) => {
      view.setFloat32(idx * 16 + 0,  x, true)
      view.setFloat32(idx * 16 + 4,  y, true)
      view.setFloat32(idx * 16 + 8,  z, true)
      view.setFloat32(idx * 16 + 12, i, true)
    })

    const result = parser.parse(buffer)
    expect(result.count).toBe(3)

    // positions: stride=3
    points.forEach(([x, y, z], idx) => {
      expect(result.positions[idx * 3]).toBeCloseTo(x)
      expect(result.positions[idx * 3 + 1]).toBeCloseTo(y)
      expect(result.positions[idx * 3 + 2]).toBeCloseTo(z)
    })

    // intensities: stride=1
    points.forEach(([, , , intensity], idx) => {
      expect(result.intensities[idx]).toBeCloseTo(intensity)
    })
  })

  it('不完整数据（byteLength 不是 16 的倍数）截断处理', () => {
    // 1 个完整点 (16 字节) + 8 字节多余数据 = 24 字节
    const buffer = new ArrayBuffer(24)
    const view = new DataView(buffer)
    view.setFloat32(0,  10.0, true)
    view.setFloat32(4,  20.0, true)
    view.setFloat32(8,  30.0, true)
    view.setFloat32(12, 0.9, true)
    // 后 8 字节是不完整的第二个点，应被截断

    const result = parser.parse(buffer)
    expect(result.count).toBe(1)
    expect(result.positions[0]).toBeCloseTo(10.0)
    expect(result.positions[1]).toBeCloseTo(20.0)
    expect(result.positions[2]).toBeCloseTo(30.0)
    expect(result.intensities[0]).toBeCloseTo(0.9)
  })
})
