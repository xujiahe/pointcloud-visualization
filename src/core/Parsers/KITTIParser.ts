import type { ParsedPointCloud } from '@/types'

export class KITTIParser {
  /**
   * 解析 KITTI .bin 格式点云文件
   * 格式：每个点 4 个 float32（x, y, z, intensity），小端序，无文件头
   */
  parse(buffer: ArrayBuffer): ParsedPointCloud {
    if (buffer.byteLength === 0) {
      return { positions: new Float32Array(0), intensities: new Float32Array(0), count: 0 }
    }

    const raw = new Float32Array(buffer)
    const count = Math.floor(raw.length / 4)

    if (count === 0) {
      return { positions: new Float32Array(0), intensities: new Float32Array(0), count: 0 }
    }

    const positions = new Float32Array(count * 3)
    const intensities = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = raw[i * 4]     // x
      positions[i * 3 + 1] = raw[i * 4 + 1] // y
      positions[i * 3 + 2] = raw[i * 4 + 2] // z
      intensities[i]        = raw[i * 4 + 3] // intensity
    }

    return { positions, intensities, count }
  }
}
