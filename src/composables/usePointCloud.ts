import { ref, shallowRef, onUnmounted } from 'vue'
import { DataLoader } from '@/core/Parsers/DataLoader'
import { PointCloudCache } from '@/core/Renderer/PointCloudCache'
import type { ParsedPointCloud, WorkerRequest, WorkerResponse } from '@/types'

export function usePointCloud() {
  const isLoading = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)
  const pointCloud = shallowRef<ParsedPointCloud | null>(null)

  let worker: Worker | null = null
  let abortController: AbortController | null = null
  const loader = new DataLoader()
  const cache = new PointCloudCache()

  function createWorker(): Worker {
    return new Worker(
      new URL('../workers/pointcloud.worker.ts', import.meta.url),
      { type: 'module' }
    )
  }

  /** 通过 Worker 解析 ArrayBuffer，Transferable 零拷贝 */
  function parseInWorker(
    buffer: ArrayBuffer,
    format: 'kitti-bin' | 'pcd' | 'las' | 'laz'
  ): Promise<ParsedPointCloud> {
    return new Promise((resolve, reject) => {
      worker = createWorker()
      const req: WorkerRequest = { type: 'parse', format, buffer }
      worker.postMessage(req, { transfer: [buffer] })
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        worker?.terminate()
        worker = null
        const res = e.data
        if (res.type === 'parsed' && res.positions && res.intensities && res.count !== undefined) {
          resolve({ positions: res.positions, intensities: res.intensities, count: res.count })
        } else {
          reject(new Error(res.error ?? 'Worker parse failed'))
        }
      }
      worker.onerror = (e) => {
        worker?.terminate()
        worker = null
        reject(new Error(e.message))
      }
    })
  }

  async function loadFile(file: File): Promise<void> {
    cancel()
    isLoading.value = true
    progress.value = 0
    error.value = null
    abortController = new AbortController()

    try {
      const format = loader.detectFormat(file.name)
      if (format === 'unsupported') throw new Error(`Unsupported format: ${file.name}`)

      // 计算文件 hash 用于缓存
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onprogress = (e) => {
          if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100)
        }
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(new Error('File read error'))
        abortController!.signal.addEventListener('abort', () => { reader.abort(); reject(new DOMException('Aborted', 'AbortError')) })
        reader.readAsArrayBuffer(file)
      })

      const hash = await cache.computeHash(buffer)

      // 检查缓存
      const cached = await cache.get(hash)
      if (cached) {
        pointCloud.value = cached
        progress.value = 100
        return
      }

      // 解析并缓存
      const parsed = await parseInWorker(buffer, format)
      await cache.set(hash, parsed)
      pointCloud.value = parsed
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        error.value = null
      } else {
        error.value = err instanceof Error ? err.message : String(err)
      }
    } finally {
      isLoading.value = false
      abortController = null
    }
  }

  async function loadURL(url: string): Promise<void> {
    cancel()
    isLoading.value = true
    progress.value = 0
    error.value = null
    abortController = new AbortController()

    try {
      const filename = url.split('/').pop() ?? url
      const format = loader.detectFormat(filename)
      if (format === 'unsupported') throw new Error(`Unsupported format: ${filename}`)

      const response = await fetch(url, { signal: abortController.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

      // 流式读取并报告进度
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        if (total > 0) progress.value = Math.round((loaded / total) * 100)
      }

      const buffer = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }

      const hash = await cache.computeHash(buffer.buffer)

      // 检查缓存
      const cached = await cache.get(hash)
      if (cached) {
        pointCloud.value = cached
        progress.value = 100
        return
      }

      // 解析并缓存
      const parsed = await parseInWorker(buffer.buffer, format)
      await cache.set(hash, parsed)
      pointCloud.value = parsed
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        error.value = null
      } else {
        error.value = err instanceof Error ? err.message : String(err)
      }
    } finally {
      isLoading.value = false
      abortController = null
    }
  }

  function cancel(): void {
    abortController?.abort()
    abortController = null
    worker?.terminate()
    worker = null
    isLoading.value = false
  }

  onUnmounted(() => { cancel() })

  return { isLoading, progress, error, pointCloud, loadFile, loadURL, cancel }
}
