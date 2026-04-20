import type { ParsedPointCloud } from '@/types'

interface PCDHeader {
  fields: string[]
  size: number[]
  type: string[]
  count: number[]
  width: number
  height: number
  points: number
  dataEncoding: 'ascii' | 'binary' | 'binary_compressed'
}

export class PCDParser {
  parse(buffer: ArrayBuffer): ParsedPointCloud {
    const text = new TextDecoder().decode(buffer)
    const header = this.parseHeader(text)

    // 在原始字节中精确定位 DATA 行结束位置
    const dataStart = this.findDataStart(buffer)

    if (header.dataEncoding === 'ascii') {
      const dataLineMatch = text.match(/^DATA\s+\S+\s*\n/m)
      if (!dataLineMatch || dataLineMatch.index === undefined) {
        throw new Error('PCD: DATA section not found')
      }
      const textDataStart = dataLineMatch.index + dataLineMatch[0].length
      const lines = text.slice(textDataStart).trim().split('\n')
      return this.parseASCII(lines, header)
    } else if (header.dataEncoding === 'binary') {
      return this.parseBinary(new DataView(buffer, dataStart), header)
    } else {
      // binary_compressed: LZF 压缩格式
      return this.parseBinaryCompressed(buffer, dataStart, header)
    }
  }

  /**
   * 在原始字节中找到 DATA 行结束后的字节偏移
   */
  private findDataStart(buffer: ArrayBuffer): number {
    const bytes = new Uint8Array(buffer)
    // 搜索 "DATA " 字符串
    const dataMarker = new TextEncoder().encode('DATA ')
    for (let i = 0; i < bytes.length - dataMarker.length; i++) {
      let match = true
      for (let j = 0; j < dataMarker.length; j++) {
        if (bytes[i + j] !== dataMarker[j]) { match = false; break }
      }
      if (match) {
        // 找到 DATA 行，跳过到换行符后
        let pos = i + dataMarker.length
        while (pos < bytes.length && bytes[pos] !== 0x0a) pos++
        return pos + 1 // 跳过 \n
      }
    }
    throw new Error('PCD: DATA section not found in binary')
  }

  private parseHeader(text: string): PCDHeader {
    const lines = text.split('\n')
    const header: Partial<PCDHeader> = {}

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed === '') continue
      if (trimmed.startsWith('DATA')) {
        const encoding = trimmed.split(/\s+/)[1] as PCDHeader['dataEncoding']
        header.dataEncoding = encoding
        break
      }

      const parts = trimmed.split(/\s+/)
      const key = parts[0].toLowerCase()
      const values = parts.slice(1)

      switch (key) {
        case 'fields': header.fields = values; break
        case 'size':   header.size   = values.map(Number); break
        case 'type':   header.type   = values; break
        case 'count':  header.count  = values.map(Number); break
        case 'width':  header.width  = Number(values[0]); break
        case 'height': header.height = Number(values[0]); break
        case 'points': header.points = Number(values[0]); break
      }
    }

    if (!header.fields || !header.size || !header.type || !header.count ||
        header.width === undefined || header.height === undefined ||
        header.points === undefined || !header.dataEncoding) {
      throw new Error('PCD: incomplete header')
    }

    return header as PCDHeader
  }

  private parseASCII(lines: string[], header: PCDHeader): ParsedPointCloud {
    const count = Math.min(lines.filter(l => l.trim()).length, header.points)
    const positions = new Float32Array(count * 3)
    const intensities = new Float32Array(count)

    const xIdx = header.fields.indexOf('x')
    const yIdx = header.fields.indexOf('y')
    const zIdx = header.fields.indexOf('z')
    const iIdx = header.fields.indexOf('intensity')

    let validCount = 0
    for (const line of lines) {
      if (!line.trim() || validCount >= count) break
      const values = line.trim().split(/\s+/).map(Number)
      if (xIdx >= 0) positions[validCount * 3]     = values[xIdx]
      if (yIdx >= 0) positions[validCount * 3 + 1] = values[yIdx]
      if (zIdx >= 0) positions[validCount * 3 + 2] = values[zIdx]
      if (iIdx >= 0) intensities[validCount]        = values[iIdx]
      validCount++
    }

    return { positions, intensities, count: validCount }
  }

  private parseBinary(dataView: DataView, header: PCDHeader): ParsedPointCloud {
    const count = header.points
    const positions = new Float32Array(count * 3)
    const intensities = new Float32Array(count)

    const xIdx = header.fields.indexOf('x')
    const yIdx = header.fields.indexOf('y')
    const zIdx = header.fields.indexOf('z')
    const iIdx = header.fields.indexOf('intensity')

    // 计算每个字段的字节偏移
    const fieldOffsets: number[] = []
    let offset = 0
    for (let f = 0; f < header.fields.length; f++) {
      fieldOffsets.push(offset)
      offset += header.size[f] * header.count[f]
    }
    const pointSize = offset

    for (let i = 0; i < count; i++) {
      const base = i * pointSize
      if (xIdx >= 0) positions[i * 3]     = dataView.getFloat32(base + fieldOffsets[xIdx], true)
      if (yIdx >= 0) positions[i * 3 + 1] = dataView.getFloat32(base + fieldOffsets[yIdx], true)
      if (zIdx >= 0) positions[i * 3 + 2] = dataView.getFloat32(base + fieldOffsets[zIdx], true)
      if (iIdx >= 0) intensities[i]        = dataView.getFloat32(base + fieldOffsets[iIdx], true)
    }

    return { positions, intensities, count }
  }

  /**
   * 解析 binary_compressed 格式
   * 结构：[compressed_size: uint32LE][uncompressed_size: uint32LE][lzf_data...]
   * 数据以列优先（column-major）存储：每个字段的所有点连续存放
   */
  private parseBinaryCompressed(
    buffer: ArrayBuffer,
    dataStart: number,
    header: PCDHeader
  ): ParsedPointCloud {
    const view = new DataView(buffer, dataStart)
    const compressedSize   = view.getUint32(0, true)
    const uncompressedSize = view.getUint32(4, true)

    // LZF 解压
    const compressed   = new Uint8Array(buffer, dataStart + 8, compressedSize)
    const uncompressed = this.lzfDecompress(compressed, uncompressedSize)

    // binary_compressed 是列优先存储：每个字段的所有点连续排列
    // 计算每个字段的字节大小和偏移
    const fieldSizes: number[] = header.fields.map((_, f) => header.size[f] * header.count[f])
    const fieldOffsets: number[] = []
    let off = 0
    for (const sz of fieldSizes) {
      fieldOffsets.push(off)
      off += sz * header.points
    }

    const count = header.points
    const positions  = new Float32Array(count * 3)
    const intensities = new Float32Array(count)

    const xIdx = header.fields.indexOf('x')
    const yIdx = header.fields.indexOf('y')
    const zIdx = header.fields.indexOf('z')
    const iIdx = header.fields.indexOf('intensity')

    const dv = new DataView(uncompressed.buffer)

    for (let i = 0; i < count; i++) {
      if (xIdx >= 0) {
        const byteOff = fieldOffsets[xIdx] + i * header.size[xIdx]
        positions[i * 3]     = dv.getFloat32(byteOff, true)
      }
      if (yIdx >= 0) {
        const byteOff = fieldOffsets[yIdx] + i * header.size[yIdx]
        positions[i * 3 + 1] = dv.getFloat32(byteOff, true)
      }
      if (zIdx >= 0) {
        const byteOff = fieldOffsets[zIdx] + i * header.size[zIdx]
        positions[i * 3 + 2] = dv.getFloat32(byteOff, true)
      }
      if (iIdx >= 0) {
        const byteOff = fieldOffsets[iIdx] + i * header.size[iIdx]
        intensities[i] = dv.getFloat32(byteOff, true)
      }
    }

    return { positions, intensities, count }
  }

  /**
   * LZF 解压算法（纯 JS 实现）
   * 参考：http://oldhome.schmorp.de/marc/liblzf.html
   */
  private lzfDecompress(input: Uint8Array, outputSize: number): Uint8Array {
    const output = new Uint8Array(outputSize)
    let iPos = 0
    let oPos = 0

    while (iPos < input.length) {
      let ctrl = input[iPos++]

      if (ctrl < 32) {
        // 字面量：复制 ctrl+1 个字节
        const len = ctrl + 1
        for (let i = 0; i < len; i++) {
          output[oPos++] = input[iPos++]
        }
      } else {
        // 反向引用
        let len = ctrl >> 5
        if (len === 7) {
          len += input[iPos++]
        }
        len += 2

        const ref = oPos - ((ctrl & 0x1f) << 8) - input[iPos++] - 1

        for (let i = 0; i < len; i++) {
          output[oPos++] = output[ref + i]
        }
      }
    }

    return output
  }
}
