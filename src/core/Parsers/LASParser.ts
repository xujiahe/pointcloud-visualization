import type { ParsedPointCloud } from '@/types'

/**
 * LAS 文件头（Public Header Block）
 * 规范：LAS 1.0 - 1.4
 * https://www.asprs.org/divisions-committees/lidar-division/laser-las-file-format-exchange-activities
 */
interface LASHeader {
  versionMajor: number      // 1
  versionMinor: number      // 0-4
  pointDataFormat: number   // 0-10
  headerSize: number        // 字节
  offsetToPointData: number // 字节
  pointCount: number        // 总点数
  xScale: number
  yScale: number
  zScale: number
  xOffset: number
  yOffset: number
  zOffset: number
}

/**
 * 各 Point Data Format 的字节大小
 * Format 0-5 为 LAS 1.0-1.3，Format 6-10 为 LAS 1.4
 */
const POINT_FORMAT_SIZE: Record<number, number> = {
  0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63,
  6: 30, 7: 36, 8: 38, 9: 59, 10: 67,
}

export class LASParser {
  parse(buffer: ArrayBuffer): ParsedPointCloud {
    const view = new DataView(buffer)
    const header = this.parseHeader(view)
    return this.parsePoints(view, header)
  }

  private parseHeader(view: DataView): LASHeader {
    // 验证文件签名 "LASF"
    const sig = String.fromCharCode(
      view.getUint8(0), view.getUint8(1),
      view.getUint8(2), view.getUint8(3)
    )
    if (sig !== 'LASF') throw new Error('LAS: invalid file signature, expected "LASF"')

    const versionMajor    = view.getUint8(24)
    const versionMinor    = view.getUint8(25)
    const headerSize      = view.getUint16(94, true)
    const offsetToPointData = view.getUint32(96, true)
    const pointDataFormat = view.getUint8(104)

    // LAS 1.4 用 64-bit 点数（offset 247），1.0-1.3 用 32-bit（offset 107）
    let pointCount: number
    if (versionMajor === 1 && versionMinor >= 4) {
      // LAS 1.4: point count at offset 247 (uint64, read lower 32 bits)
      pointCount = view.getUint32(247, true)
    } else {
      pointCount = view.getUint32(107, true)
    }

    const xScale  = view.getFloat64(131, true)
    const yScale  = view.getFloat64(139, true)
    const zScale  = view.getFloat64(147, true)
    const xOffset = view.getFloat64(155, true)
    const yOffset = view.getFloat64(163, true)
    const zOffset = view.getFloat64(171, true)

    return {
      versionMajor, versionMinor,
      pointDataFormat, headerSize,
      offsetToPointData, pointCount,
      xScale, yScale, zScale,
      xOffset, yOffset, zOffset,
    }
  }

  private parsePoints(view: DataView, header: LASHeader): ParsedPointCloud {
    const { pointDataFormat, offsetToPointData, pointCount } = header
    const pointSize = POINT_FORMAT_SIZE[pointDataFormat]

    if (pointSize === undefined) {
      throw new Error(`LAS: unsupported point data format ${pointDataFormat}`)
    }

    const positions   = new Float32Array(pointCount * 3)
    const intensities = new Float32Array(pointCount)

    // intensity 字段在所有 format 中都在 offset 12（uint16）
    // x/y/z 在 offset 0/4/8（int32）
    const hasIntensity = true

    for (let i = 0; i < pointCount; i++) {
      const base = offsetToPointData + i * pointSize

      // x, y, z 为 int32，需乘以 scale 并加 offset 转换为实际坐标
      const xi = view.getInt32(base,     true)
      const yi = view.getInt32(base + 4, true)
      const zi = view.getInt32(base + 8, true)

      positions[i * 3]     = xi * header.xScale + header.xOffset
      positions[i * 3 + 1] = yi * header.yScale + header.yOffset
      positions[i * 3 + 2] = zi * header.zScale + header.zOffset

      if (hasIntensity) {
        // intensity: uint16 at offset 12, normalize to [0, 1]
        intensities[i] = view.getUint16(base + 12, true) / 65535
      }
    }

    return { positions, intensities, count: pointCount }
  }
}
