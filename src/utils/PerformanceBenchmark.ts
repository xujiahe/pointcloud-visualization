/**
 * 点云性能基准测试工具
 *
 * 测量指标：
 *   - 点云生成/解析耗时
 *   - JS 堆内存占用（解析前后对比）
 *   - GPU Buffer 上传耗时
 *   - 渲染 FPS（稳定后采样）
 *   - 颜色映射耗时
 */

export interface BenchmarkResult {
  pointCount: number

  // 解析阶段
  parseTimeMs: number          // 解析耗时（ms）
  memBeforeMB: number          // 解析前 JS 堆（MB）
  memAfterMB: number           // 解析后 JS 堆（MB）
  memDeltaMB: number           // 增量（MB）
  expectedMemMB: number        // 理论内存（positions+intensities）

  // 渲染阶段
  colorBuildTimeMs: number     // 颜色数组构建耗时（ms）
  gpuUploadTimeMs: number      // BufferGeometry 上传耗时（ms）

  // FPS（稳定后 3 秒采样均值）
  avgFps: number
  minFps: number
  maxFps: number

  // 汇总
  summary: string
}

/** 生成指定数量的随机点云数据（模拟真实场景分布） */
export function generateMockPointCloud(count: number): {
  positions: Float32Array
  intensities: Float32Array
} {
  const positions = new Float32Array(count * 3)
  const intensities = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // 模拟自动驾驶场景：以原点为中心，半径 50m 的球形分布
    const r = Math.random() * 50
    const theta = Math.random() * Math.PI * 2
    const phi = (Math.random() - 0.5) * Math.PI * 0.5  // 俯仰角限制在 ±45°

    positions[i * 3]     = r * Math.cos(phi) * Math.cos(theta)  // x
    positions[i * 3 + 1] = r * Math.cos(phi) * Math.sin(theta)  // y
    positions[i * 3 + 2] = r * Math.sin(phi) - 1                // z（略低于原点）

    intensities[i] = Math.random()  // 随机强度 [0, 1]
  }

  return { positions, intensities }
}

/** 读取当前 JS 堆内存（MB），仅 Chrome 支持 */
function getHeapMB(): number {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number }
  }
  if (perf.memory) {
    return perf.memory.usedJSHeapSize / 1024 / 1024
  }
  return 0
}

/** 理论内存计算（MB） */
function calcExpectedMemMB(count: number): number {
  // positions: count * 3 * 4 bytes
  // intensities: count * 4 bytes
  // colors: count * 3 * 4 bytes（渲染时额外分配）
  return (count * 3 * 4 + count * 4 + count * 3 * 4) / 1024 / 1024
}

/**
 * 运行完整基准测试
 * @param pointCount 测试点数（建议 100_000 / 500_000 / 1_000_000）
 * @param onFpsSample FPS 采样回调（由外部渲染循环调用）
 */
export async function runBenchmark(
  pointCount: number,
  onFpsSample: () => Promise<{ avg: number; min: number; max: number }>
): Promise<BenchmarkResult> {
  // ── 1. 解析阶段 ──────────────────────────────────────────────
  // 强制 GC（Chrome DevTools 可手动触发，这里只能等待）
  await new Promise(r => setTimeout(r, 100))

  const memBefore = getHeapMB()
  const parseStart = performance.now()

  const { positions, intensities } = generateMockPointCloud(pointCount)

  const parseEnd = performance.now()
  const memAfter = getHeapMB()

  // ── 2. 颜色映射耗时 ──────────────────────────────────────────
  const colorStart = performance.now()
  const colors = new Float32Array(pointCount * 3)

  // 模拟 Jet colormap（与实际 buildIntensityColors 相同逻辑）
  let minI = Infinity, maxI = -Infinity
  for (let i = 0; i < pointCount; i++) {
    if (intensities[i] < minI) minI = intensities[i]
    if (intensities[i] > maxI) maxI = intensities[i]
  }
  const range = maxI - minI || 1
  for (let i = 0; i < pointCount; i++) {
    const v = (intensities[i] - minI) / range
    colors[i * 3]     = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 3)))
    colors[i * 3 + 1] = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 2)))
    colors[i * 3 + 2] = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 1)))
  }
  const colorEnd = performance.now()

  // ── 3. GPU 上传耗时（模拟 BufferGeometry 创建） ───────────────
  const gpuStart = performance.now()
  // 在真实场景中这里是 THREE.BufferGeometry + BufferAttribute
  // 这里用 ArrayBuffer 操作模拟内存拷贝开销
  const posBuffer = positions.buffer.slice(0)
  const colBuffer = colors.buffer.slice(0)
  void posBuffer; void colBuffer  // 防止被优化掉
  const gpuEnd = performance.now()

  // ── 4. FPS 采样（由外部渲染循环提供） ────────────────────────
  const fps = await onFpsSample()

  // ── 5. 汇总 ──────────────────────────────────────────────────
  const result: BenchmarkResult = {
    pointCount,
    parseTimeMs:     Math.round(parseEnd - parseStart),
    memBeforeMB:     Math.round(memBefore * 10) / 10,
    memAfterMB:      Math.round(memAfter * 10) / 10,
    memDeltaMB:      Math.round((memAfter - memBefore) * 10) / 10,
    expectedMemMB:   Math.round(calcExpectedMemMB(pointCount) * 10) / 10,
    colorBuildTimeMs: Math.round(colorEnd - colorStart),
    gpuUploadTimeMs:  Math.round(gpuEnd - gpuStart),
    avgFps: fps.avg,
    minFps: fps.min,
    maxFps: fps.max,
    summary: '',
  }

  result.summary = formatSummary(result)
  return result
}

function formatSummary(r: BenchmarkResult): string {
  const M = (r.pointCount / 1_000_000).toFixed(1)
  return [
    `═══ 点云性能基准测试 (${M}M 点) ═══`,
    `解析耗时:     ${r.parseTimeMs} ms`,
    `颜色映射:     ${r.colorBuildTimeMs} ms`,
    `GPU 上传:     ${r.gpuUploadTimeMs} ms`,
    `总处理耗时:   ${r.parseTimeMs + r.colorBuildTimeMs + r.gpuUploadTimeMs} ms`,
    `─────────────────────────────`,
    `内存增量:     ${r.memDeltaMB} MB  (理论 ${r.expectedMemMB} MB)`,
    `堆内存:       ${r.memBeforeMB} → ${r.memAfterMB} MB`,
    `─────────────────────────────`,
    `FPS 均值:     ${r.avgFps}`,
    `FPS 范围:     ${r.minFps} ~ ${r.maxFps}`,
    `达标(≥30):    ${r.avgFps >= 30 ? '✅ 通过' : '❌ 未达标'}`,
  ].join('\n')
}
