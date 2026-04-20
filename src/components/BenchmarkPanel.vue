<template>
  <div class="benchmark-panel">
    <div class="panel-title">性能基准测试</div>

    <!-- 测试配置 -->
    <div class="config-row">
      <span class="cfg-label">点数量</span>
      <n-select
        v-model:value="selectedCount"
        :options="countOptions"
        size="small"
        style="width: 130px"
      />
    </div>

    <n-button
      type="primary"
      size="small"
      :loading="running"
      style="width: 100%; margin-top: 8px"
      @click="runTest"
    >
      {{ running ? `测试中... ${progress}%` : '▶ 开始测试' }}
    </n-button>

    <!-- 进度条 -->
    <n-progress
      v-if="running"
      type="line"
      :percentage="progress"
      :show-indicator="false"
      style="margin-top: 6px"
    />

    <!-- 结果展示 -->
    <div v-if="result" class="result-block">

      <div class="result-section">
        <div class="section-title">⏱ 处理耗时</div>
        <div class="metric-row">
          <span>解析</span>
          <span :class="timeClass(result.parseTimeMs, 100, 300)">
            {{ result.parseTimeMs }} ms
          </span>
        </div>
        <div class="metric-row">
          <span>颜色映射</span>
          <span :class="timeClass(result.colorBuildTimeMs, 50, 150)">
            {{ result.colorBuildTimeMs }} ms
          </span>
        </div>
        <div class="metric-row">
          <span>GPU 上传</span>
          <span>{{ result.gpuUploadTimeMs }} ms</span>
        </div>
        <div class="metric-row total">
          <span>总计</span>
          <span>{{ result.parseTimeMs + result.colorBuildTimeMs + result.gpuUploadTimeMs }} ms</span>
        </div>
      </div>

      <div class="result-section">
        <div class="section-title">💾 内存占用</div>
        <div class="metric-row">
          <span>JS 堆增量</span>
          <span :class="memClass(result.memDeltaMB)">{{ result.memDeltaMB }} MB</span>
        </div>
        <div class="metric-row">
          <span>理论值</span>
          <span class="dim">{{ result.expectedMemMB }} MB</span>
        </div>
        <div class="metric-row">
          <span>堆变化</span>
          <span class="dim">{{ result.memBeforeMB }} → {{ result.memAfterMB }} MB</span>
        </div>
      </div>

      <div class="result-section">
        <div class="section-title">🎮 渲染 FPS</div>
        <div class="metric-row">
          <span>平均 FPS</span>
          <span :class="fpsClass(result.avgFps)">{{ result.avgFps }}</span>
        </div>
        <div class="metric-row">
          <span>范围</span>
          <span class="dim">{{ result.minFps }} ~ {{ result.maxFps }}</span>
        </div>
        <div class="metric-row">
          <span>达标 (≥30)</span>
          <span :class="result.avgFps >= 30 ? 'pass' : 'fail'">
            {{ result.avgFps >= 30 ? '✅ 通过' : '❌ 未达标' }}
          </span>
        </div>
      </div>

      <!-- 历史记录 -->
      <div v-if="history.length > 1" class="result-section">
        <div class="section-title">📊 历史对比</div>
        <div v-for="(h, i) in history.slice(-4)" :key="i" class="history-row">
          <span class="dim">{{ (h.pointCount / 1_000_000).toFixed(1) }}M</span>
          <span>{{ h.parseTimeMs }}ms</span>
          <span :class="fpsClass(h.avgFps)">{{ h.avgFps }} fps</span>
          <span :class="memClass(h.memDeltaMB)">{{ h.memDeltaMB }}MB</span>
        </div>
      </div>

    </div>

    <!-- 无结果提示 -->
    <div v-else class="hint">
      选择点数量后点击开始测试
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NSelect, NProgress } from 'naive-ui'
import { generateMockPointCloud } from '@/utils/PerformanceBenchmark'
import type { BenchmarkResult } from '@/utils/PerformanceBenchmark'

/** 读取 JS 堆内存（MB），仅 Chrome 支持 */
function getHeapMB(): number {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } }
  return perf.memory ? perf.memory.usedJSHeapSize / 1024 / 1024 : 0
}

/** 模拟颜色映射（用于测量耗时） */
function buildColors(intensities: Float32Array, positions: Float32Array, count: number): Float32Array {
  const colors = new Float32Array(count * 3)
  let minI = Infinity, maxI = -Infinity
  for (let i = 0; i < count; i++) {
    if (intensities[i] < minI) minI = intensities[i]
    if (intensities[i] > maxI) maxI = intensities[i]
  }
  const range = maxI - minI || 1
  for (let i = 0; i < count; i++) {
    const v = (intensities[i] - minI) / range
    colors[i * 3]     = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 3)))
    colors[i * 3 + 1] = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 2)))
    colors[i * 3 + 2] = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 1)))
  }
  void positions  // 避免 unused 警告
  return colors
}

function formatSummary(r: BenchmarkResult): string {
  const M = (r.pointCount / 1_000_000).toFixed(1)
  return [
    `═══ 点云性能基准 (${M}M 点) ═══`,
    `解析: ${r.parseTimeMs}ms  颜色: ${r.colorBuildTimeMs}ms`,
    `内存增量: ${r.memDeltaMB}MB (理论 ${r.expectedMemMB}MB)`,
    `FPS: avg=${r.avgFps} min=${r.minFps} max=${r.maxFps}`,
    `达标(≥30fps): ${r.avgFps >= 30 ? '✅' : '❌'}`,
  ].join('\n')
}

const props = defineProps<{
  /** 获取当前 FPS 的函数（由父组件提供） */
  getFps: () => number
  /** 通知父组件加载测试点云 */
  onLoadTestCloud?: (positions: Float32Array, intensities: Float32Array, count: number) => void
}>()

const selectedCount = ref(1_000_000)
const running = ref(false)
const progress = ref(0)
const result = ref<BenchmarkResult | null>(null)
const history = ref<BenchmarkResult[]>([])

const countOptions = [
  { label: '10 万点',  value: 100_000 },
  { label: '50 万点',  value: 500_000 },
  { label: '100 万点', value: 1_000_000 },
  { label: '200 万点', value: 2_000_000 },
  { label: '500 万点', value: 5_000_000 },
]

async function runTest(): Promise<void> {
  running.value = true
  progress.value = 0
  result.value = null

  try {
    // ── 阶段 1：内存基线（解析前）──────────────────────────────
    const memBefore = getHeapMB()
    progress.value = 10

    // ── 阶段 2：生成点云并加载到渲染器 ────────────────────────
    const parseStart = performance.now()
    const { positions, intensities } = generateMockPointCloud(selectedCount.value)
    const parseTimeMs = Math.round(performance.now() - parseStart)
    progress.value = 30

    const memAfter = getHeapMB()

    // 颜色映射耗时
    const colorStart = performance.now()
    buildColors(intensities, positions, selectedCount.value)
    const colorBuildTimeMs = Math.round(performance.now() - colorStart)

    // 加载到 Three.js 场景
    props.onLoadTestCloud?.(positions, intensities, selectedCount.value)
    progress.value = 50

    // ── 阶段 3：等待渲染稳定（2 秒预热）──────────────────────
    await new Promise(r => setTimeout(r, 2000))
    progress.value = 60

    // ── 阶段 4：用 rAF 精确采集 FPS（3 秒窗口）───────────────
    const fpsSamples: number[] = []
    let collecting = true
    let lastTime = performance.now()
    let frameCount = 0

    const collectFps = () => {
      if (!collecting) return
      frameCount++
      const now = performance.now()
      if (now - lastTime >= 500) {
        // 每 500ms 计算一次瞬时 FPS
        const instantFps = Math.round(frameCount / ((now - lastTime) / 1000))
        if (instantFps > 0) fpsSamples.push(instantFps)
        frameCount = 0
        lastTime = now
        progress.value = 60 + Math.min(30, fpsSamples.length * 5)
      }
      requestAnimationFrame(collectFps)
    }
    requestAnimationFrame(collectFps)

    await new Promise(r => setTimeout(r, 3000))
    collecting = false
    progress.value = 95

    // 也读取渲染器自身的 FPS（作为补充）
    const rendererFps = props.getFps()
    if (rendererFps > 0) fpsSamples.push(rendererFps)

    const validSamples = fpsSamples.filter(f => f > 0)
    const avgFps = validSamples.length
      ? Math.round(validSamples.reduce((a, b) => a + b, 0) / validSamples.length)
      : 0
    const minFps = validSamples.length ? Math.min(...validSamples) : 0
    const maxFps = validSamples.length ? Math.max(...validSamples) : 0

    // ── 阶段 5：组装结果 ──────────────────────────────────────
    const expectedMemMB = Math.round(
      (selectedCount.value * 3 * 4 + selectedCount.value * 4 + selectedCount.value * 3 * 4)
      / 1024 / 1024 * 10
    ) / 10

    const r: BenchmarkResult = {
      pointCount: selectedCount.value,
      parseTimeMs,
      memBeforeMB: Math.round(memBefore * 10) / 10,
      memAfterMB:  Math.round(memAfter * 10) / 10,
      memDeltaMB:  Math.round((memAfter - memBefore) * 10) / 10,
      expectedMemMB,
      colorBuildTimeMs,
      gpuUploadTimeMs: 0,  // Three.js 内部，无法直接测量
      avgFps,
      minFps,
      maxFps,
      summary: '',
    }
    r.summary = formatSummary(r)

    result.value = r
    history.value.push(r)
    progress.value = 100

    console.log(r.summary)
    console.table({
      '点数量':       r.pointCount.toLocaleString(),
      '解析(ms)':     r.parseTimeMs,
      '颜色映射(ms)': r.colorBuildTimeMs,
      '内存增量(MB)': r.memDeltaMB,
      '理论内存(MB)': r.expectedMemMB,
      '平均FPS':      r.avgFps,
      '最低FPS':      r.minFps,
      'FPS采样数':    validSamples.length,
    })

  } finally {
    running.value = false
  }
}

// 颜色辅助函数
function timeClass(ms: number, good: number, bad: number): string {
  if (ms <= good) return 'pass'
  if (ms >= bad) return 'fail'
  return 'warn'
}
function fpsClass(fps: number): string {
  if (fps >= 30) return 'pass'
  if (fps >= 20) return 'warn'
  return 'fail'
}
function memClass(mb: number): string {
  if (mb <= 50) return 'pass'
  if (mb <= 150) return 'warn'
  return 'fail'
}
</script>

<style scoped>
.benchmark-panel {
  padding: 10px;
  font-size: 12px;
  color: #ccc;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #ddd;
  margin-bottom: 10px;
}
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cfg-label {
  color: #888;
  white-space: nowrap;
}
.result-block {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.result-section {
  background: #1a1a2e;
  border-radius: 6px;
  padding: 8px;
}
.section-title {
  font-size: 11px;
  color: #888;
  margin-bottom: 6px;
  font-weight: 600;
}
.metric-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  line-height: 1.6;
}
.metric-row.total {
  border-top: 1px solid #2a2a40;
  margin-top: 4px;
  padding-top: 4px;
  font-weight: 600;
  color: #ddd;
}
.history-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 4px;
  padding: 2px 0;
  font-size: 11px;
}
.hint {
  margin-top: 12px;
  color: #555;
  text-align: center;
  font-size: 11px;
}

/* 状态颜色 */
.pass  { color: #4ade80; }
.warn  { color: #fbbf24; }
.fail  { color: #f87171; }
.dim   { color: #888; }
</style>
