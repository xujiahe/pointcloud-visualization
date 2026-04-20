import type { ParsedPointCloud, LoadOptions } from '@/types'
import { KITTIParser } from './KITTIParser'
import { PCDParser } from './PCDParser'
import { LASParser } from './LASParser'

export class UnsupportedFormatError extends Error {
  constructor(filename: string) {
    super(
      `Unsupported file format: "${filename}". Supported formats: .bin (KITTI), .pcd (PCD), .las (LAS), .laz (LAZ)`
    )
    this.name = 'UnsupportedFormatError'
  }
}

export class DataLoader {
  private readonly TIMEOUT_MS = 10_000

  detectFormat(filename: string): 'kitti-bin' | 'pcd' | 'las' | 'laz' | 'unsupported' {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.bin')) return 'kitti-bin'
    if (lower.endsWith('.pcd')) return 'pcd'
    if (lower.endsWith('.las')) return 'las'
    if (lower.endsWith('.laz')) return 'laz'
    return 'unsupported'
  }

  async loadFromURL(url: string, options?: LoadOptions): Promise<ParsedPointCloud> {
    const filename = url.split('/').pop() ?? url
    const format = this.detectFormat(filename)
    if (format === 'unsupported') throw new UnsupportedFormatError(filename)

    const controller = new AbortController()
    const signal = options?.signal
      ? this.mergeSignals(options.signal, controller.signal)
      : controller.signal

    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS)

    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (options?.onProgress && response.body) {
        const buffer = await this.readWithProgress(response.body, total, options.onProgress)
        return this.parse(buffer, format)
      }

      const buffer = await response.arrayBuffer()
      return this.parse(buffer, format)    } finally {
      clearTimeout(timeoutId)
    }
  }

  async loadFromFile(file: File, options?: LoadOptions): Promise<ParsedPointCloud> {
    const format = this.detectFormat(file.name)
    if (format === 'unsupported') throw new UnsupportedFormatError(file.name)

    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onprogress = (e) => {
        if (e.lengthComputable && options?.onProgress) {
          options.onProgress(e.loaded, e.total)
        }
      }
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(new Error('File read error'))
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          reader.abort()
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }
      reader.readAsArrayBuffer(file)
    })

    return this.parse(buffer, format)
  }

  private async parse(
    buffer: ArrayBuffer,
    format: 'kitti-bin' | 'pcd' | 'las' | 'laz'
  ): Promise<ParsedPointCloud> {
    if (format === 'kitti-bin') return new KITTIParser().parse(buffer)
    if (format === 'pcd')       return new PCDParser().parse(buffer)
    if (format === 'las')       return new LASParser().parse(buffer)
    // LAZ: 动态导入，避免 @loaders.gl 污染测试环境
    const { LAZParser } = await import('./LAZParser')
    return new LAZParser().parse(buffer)
  }

  private async readWithProgress(
    body: ReadableStream<Uint8Array>,
    total: number,
    onProgress: (loaded: number, total: number) => void
  ): Promise<ArrayBuffer> {
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress(loaded, total)
    }

    const result = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result.buffer
  }

  private mergeSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
    const controller = new AbortController()
    const abort = () => controller.abort()
    s1.addEventListener('abort', abort)
    s2.addEventListener('abort', abort)
    return controller.signal
  }
}
