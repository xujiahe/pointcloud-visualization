<template>
  <div
    v-if="visible"
    class="point-tooltip"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div>X: {{ point.x.toFixed(3) }}</div>
    <div>Y: {{ point.y.toFixed(3) }}</div>
    <div>Z: {{ point.z.toFixed(3) }}</div>
    <div>I: {{ point.intensity.toFixed(3) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const props = defineProps<{
  canvas: HTMLCanvasElement | null
  camera: THREE.Camera | null
  positions: Float32Array | null
  intensities: Float32Array | null
}>()

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const point = ref({ x: 0, y: 0, z: 0, intensity: 0 })

const raycaster = new THREE.Raycaster()
raycaster.params.Points = { threshold: 0.5 }
const mouse = new THREE.Vector2()

function handleMouseMove(e: MouseEvent): void {
  if (!props.canvas || !props.camera || !props.positions) {
    visible.value = false
    return
  }

  const rect = props.canvas.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, props.camera)

  // 简单最近点检测（在 z=0 平面附近）
  const count = Math.floor(props.positions.length / 3)
  let minDist = Infinity
  let minIdx = -1

  const ray = raycaster.ray
  const pt = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    pt.set(
      props.positions[i * 3],
      props.positions[i * 3 + 1],
      props.positions[i * 3 + 2]
    )
    const dist = ray.distanceToPoint(pt)
    if (dist < minDist) {
      minDist = dist
      minIdx = i
    }
  }

  if (minIdx >= 0 && minDist < 1.0) {
    point.value = {
      x: props.positions[minIdx * 3],
      y: props.positions[minIdx * 3 + 1],
      z: props.positions[minIdx * 3 + 2],
      intensity: props.intensities ? props.intensities[minIdx] : 0,
    }
    x.value = e.clientX - rect.left + 12
    y.value = e.clientY - rect.top + 12
    visible.value = true
  } else {
    visible.value = false
  }
}

function handleMouseLeave(): void {
  visible.value = false
}

onMounted(() => {
  props.canvas?.addEventListener('mousemove', handleMouseMove)
  props.canvas?.addEventListener('mouseleave', handleMouseLeave)
})

onUnmounted(() => {
  props.canvas?.removeEventListener('mousemove', handleMouseMove)
  props.canvas?.removeEventListener('mouseleave', handleMouseLeave)
})
</script>

<style scoped>
.point-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  pointer-events: none;
  z-index: 20;
  line-height: 1.6;
  white-space: nowrap;
}
</style>
