import { parse } from '@loaders.gl/core'
import { LASLoader } from '@loaders.gl/las'
import type { ParsedPointCloud } from '@/types'

/**
 * LAZ 解析器（使用 @loaders.gl/las）
 * LAZ 是 LAS 的压缩版本，使用 LASzip 算法
 */
export class LAZParser {
  async parse(buffer: ArrayBuffer): Promise<ParsedPointCloud> {
    try {
      // @loaders.gl/las 返回的数据结构
      const result = await parse(buffer, LASLoader, {
        las: {
          skip: 0,
          colorDepth: 8,
        },
      })

      // result.attributes 包含各字段的 TypedArray
      const positions = result.attributes.POSITION?.value as Float32Array
      const intensities = result.attributes.intensity?.value as Uint16Array

      if (!positions) {
        throw new Error('LAZ: no position data found')
      }

      const count = Math.floor(positions.length / 3)

      // intensity 为 uint16，归一化到 [0, 1]
      const normalizedIntensities = new Float32Array(count)
      if (intensities) {
        for (let i = 0; i < count; i++) {
          normalizedIntensities[i] = intensities[i] / 65535
        }
      }

      return {
        positions,
        intensities: normalizedIntensities,
        count,
      }
    } catch (err) {
      throw new Error(`LAZ parse error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
