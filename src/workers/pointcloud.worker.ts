import { KITTIParser } from '@/core/Parsers/KITTIParser'
import { PCDParser } from '@/core/Parsers/PCDParser'
import { LASParser } from '@/core/Parsers/LASParser'
import type { WorkerRequest, WorkerResponse } from '@/types'

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, format, buffer } = event.data

  if (type !== 'parse') {
    const response: WorkerResponse = { type: 'error', error: `Unknown message type: ${type}` }
    self.postMessage(response)
    return
  }

  try {
    let positions: Float32Array
    let intensities: Float32Array
    let count: number

    if (format === 'kitti-bin') {
      const result = new KITTIParser().parse(buffer)
      positions = result.positions; intensities = result.intensities; count = result.count
    } else if (format === 'pcd') {
      const result = new PCDParser().parse(buffer)
      positions = result.positions; intensities = result.intensities; count = result.count
    } else if (format === 'las') {
      const result = new LASParser().parse(buffer)
      positions = result.positions; intensities = result.intensities; count = result.count
    } else if (format === 'laz') {
      const { LAZParser } = await import('@/core/Parsers/LAZParser')
      const result = await new LAZParser().parse(buffer)
      positions = result.positions; intensities = result.intensities; count = result.count
    } else {
      throw new Error(`Unsupported format: ${format}`)
    }

    const response: WorkerResponse = { type: 'parsed', positions, intensities, count }
    self.postMessage(response, { transfer: [positions.buffer, intensities.buffer] })
  } catch (err) {
    const response: WorkerResponse = {
      type: 'error',
      error: err instanceof Error ? err.message : String(err)
    }
    self.postMessage(response)
  }
}
