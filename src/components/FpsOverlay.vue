<template>
  <div class="fps-overlay">
    <div class="fps-row" :class="{ degraded: performanceDegraded }">
      <span class="label">FPS</span>
      <span class="value">{{ fps }}</span>
    </div>
    <div class="fps-row">
      <span class="label">Points</span>
      <span class="value">{{ formatCount(renderedPointCount) }} / {{ formatCount(totalPointCount) }}</span>
    </div>
    <div v-if="performanceDegraded" class="degraded-badge">⚠ 性能降级</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  fps: number
  renderedPointCount: number
  totalPointCount: number
  performanceDegraded: boolean
}>()

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}
</script>

<style scoped>
.fps-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
  pointer-events: none;
  z-index: 10;
  min-width: 140px;
}
.fps-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.6;
}
.fps-row.degraded .value { color: #ff6b6b; }
.label { color: #aaa; }
.value { color: #4ade80; font-weight: bold; }
.degraded-badge {
  margin-top: 4px;
  color: #ff6b6b;
  font-size: 11px;
  text-align: center;
}
</style>
