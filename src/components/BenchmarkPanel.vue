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
import { runBenchmark, generateMockPointCloud } from '@/utils/PerformanceBenchmark'
import type { BenchmarkResult } from '@/utils/PerformanceBenchmark'

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
    // 阶段 1：生成测试数据并加载到渲染器（20%）
    progress.value = 10
    const { positions, intensities } = generateMockPointCloud(selectedCount.value)
    progress.value = 30

    // 通知父组件加载点云到 Three.js 场景
    props.onLoadTestCloud?.(positions, intensities, selectedCount.value)
    progress.value = 50

    // 阶段 2：等待渲染稳定（1.5 秒预热）
    await new Promise(r => setTimeout(r, 1500))
    progress.value = 65

    // 阶段 3：采集 FPS（3 秒窗口）
    const fpsSamples: number[] = []
    const sampleInterval = setInterval(() => {
      fpsSamples.push(props.currentFps)
    }, 200)

    await new Promise(r => setTimeout(r, 3000))
    clearInterval(sampleInterval)
    progress.value = 90

    const validSamples = fpsSamples.filter(f => f > 0)
    const avgFps = validSamples.length
      ? Math.round(validSamples.reduce((a, b) => a + b, 0) / validSamples.length)
      : 0
    const minFps = validSamples.length ? Math.min(...validSamples) : 0
    const maxFps = validSamples.length ? Math.max(...validSamples) : 0

    // 阶段 4：运行基准测试（含内存和耗时测量）
    const r = await runBenchmark(selectedCount.value, async () => ({
      avg: avgFps, min: minFps, max: maxFps,
    }))

    result.value = r
    history.value.push(r)
    progress.value = 100

    // 打印到控制台（便于截图记录）
    console.log(r.summary)
    console.table({
      '点数量': r.pointCount.toLocaleString(),
      '解析耗时(ms)': r.parseTimeMs,
      '颜色映射(ms)': r.colorBuildTimeMs,
      '内存增量(MB)': r.memDeltaMB,
      '平均FPS': r.avgFps,
      '最低FPS': r.minFps,
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
