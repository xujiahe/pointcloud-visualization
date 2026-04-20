import { PCDParser } from '../Parsers/PCDParser'

/** 将字符串编码为 ArrayBuffer */
function encodeText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

/** 构建最小合法 PCD ASCII header */
function buildASCIIHeader(extra = ''): string {
  return [
    '# .PCD v0.7',
    'VERSION 0.7',
    'FIELDS x y z intensity',
    'SIZE 4 4 4 4',
    'TYPE F F F F',
    'COUNT 1 1 1 1',
    'WIDTH 2',
    'HEIGHT 1',
    'VIEWPOINT 0 0 0 1 0 0 0',
    'POINTS 2',
    extra,
    'DATA ascii',
  ].filter(Boolean).join('\n') + '\n'
}

describe('PCDParser', () => {
  let parser: PCDParser

  beforeEach(() => {
    parser = new PCDParser()
  })

  describe('ASCII 格式解析', () => {
    it('正确解析含 x y z intensity 字段的 ASCII PCD', () => {
      const header = buildASCIIHeader()
      const data = '1.0 2.0 3.0 0.5\n4.0 5.0 6.0 0.8\n'
      const result = parser.parse(encodeText(header + data))

      expect(result.count).toBe(2)
      expect(result.positions[0]).toBeCloseTo(1.0)
      expect(result.positions[1]).toBeCloseTo(2.0)
      expect(result.positions[2]).toBeCloseTo(3.0)
      expect(result.intensities[0]).toBeCloseTo(0.5)

      expect(result.positions[3]).toBeCloseTo(4.0)
      expect(result.positions[4]).toBeCloseTo(5.0)
      expect(result.positions[5]).toBeCloseTo(6.0)
      expect(result.intensities[1]).toBeCloseTo(0.8)
    })
  })

  describe('Binary 格式解析', () => {
    it('正确解析 binary PCD', () => {
      // 构建 binary header（1 个点）
      const headerStr = [
        '# .PCD v0.7',
        'VERSION 0.7',
        'FIELDS x y z intensity',
        'SIZE 4 4 4 4',
        'TYPE F F F F',
        'COUNT 1 1 1 1',
        'WIDTH 1',
        'HEIGHT 1',
        'VIEWPOINT 0 0 0 1 0 0 0',
        'POINTS 1',
        'DATA binary\n',
      ].join('\n')

      const headerBytes = new TextEncoder().encode(headerStr)
      // 1 个点 = 4 个 float32 = 16 字节
      const pointBuffer = new ArrayBuffer(16)
      const view = new DataView(pointBuffer)
      view.setFloat32(0,  7.0, true)  // x
      view.setFloat32(4,  8.0, true)  // y
      view.setFloat32(8,  9.0, true)  // z
      view.setFloat32(12, 0.3, true)  // intensity

      // 合并 header + binary data
      const combined = new Uint8Array(headerBytes.byteLength + 16)
      combined.set(headerBytes, 0)
      combined.set(new Uint8Array(pointBuffer), headerBytes.byteLength)

      const result = parser.parse(combined.buffer)
      expect(result.count).toBe(1)
      expect(result.positions[0]).toBeCloseTo(7.0)
      expect(result.positions[1]).toBeCloseTo(8.0)
      expect(result.positions[2]).toBeCloseTo(9.0)
      expect(result.intensities[0]).toBeCloseTo(0.3)
    })
  })

  describe('错误处理', () => {
    it('缺少 DATA 行时抛出错误', () => {
      const noDataHeader = [
        'VERSION 0.7',
        'FIELDS x y z',
        'SIZE 4 4 4',
        'TYPE F F F',
        'COUNT 1 1 1',
        'WIDTH 1',
        'HEIGHT 1',
        'POINTS 1',
        // 故意省略 DATA 行
        '1.0 2.0 3.0',
      ].join('\n')

      expect(() => parser.parse(encodeText(noDataHeader))).toThrow()
    })

    it('不完整 header（缺少必要字段）时抛出错误', () => {
      // 只有 FIELDS 和 DATA，缺少 SIZE/TYPE/COUNT/WIDTH/HEIGHT/POINTS
      const incompleteHeader = [
        'FIELDS x y z',
        'DATA ascii',
        '1.0 2.0 3.0',
      ].join('\n')

      expect(() => parser.parse(encodeText(incompleteHeader))).toThrow()
    })
  })
})
