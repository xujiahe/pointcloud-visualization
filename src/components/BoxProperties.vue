<template>
  <div v-if="box" class="box-properties">
    <div class="section-title">包围盒属性</div>

    <n-form size="small" label-placement="left" label-width="40px">
      <div class="prop-group">
        <div class="prop-group-title">中心坐标</div>
        <n-form-item label="X">
          <n-input-number
            :value="box.center[0]"
            :precision="3"
            size="small"
            @update:value="updateCenter(0, $event ?? 0)"
          />
        </n-form-item>
        <n-form-item label="Y">
          <n-input-number
            :value="box.center[1]"
            :precision="3"
            size="small"
            @update:value="updateCenter(1, $event ?? 0)"
          />
        </n-form-item>
        <n-form-item label="Z">
          <n-input-number
            :value="box.center[2]"
            :precision="3"
            size="small"
            @update:value="updateCenter(2, $event ?? 0)"
          />
        </n-form-item>
      </div>

      <div class="prop-group">
        <div class="prop-group-title">尺寸</div>
        <n-form-item label="L">
          <n-input-number
            :value="box.size[0]"
            :min="0.01"
            :precision="3"
            size="small"
            @update:value="updateSize(0, $event ?? 0.01)"
          />
        </n-form-item>
        <n-form-item label="W">
          <n-input-number
            :value="box.size[1]"
            :min="0.01"
            :precision="3"
            size="small"
            @update:value="updateSize(1, $event ?? 0.01)"
          />
        </n-form-item>
        <n-form-item label="H">
          <n-input-number
            :value="box.size[2]"
            :min="0.01"
            :precision="3"
            size="small"
            @update:value="updateSize(2, $event ?? 0.01)"
          />
        </n-form-item>
      </div>

      <div class="prop-group">
        <div class="prop-group-title">旋转</div>
        <n-form-item label="Yaw">
          <n-input-number
            :value="box.rotation"
            :precision="4"
            size="small"
            @update:value="updateRotation($event ?? 0)"
          />
        </n-form-item>
      </div>

      <div class="prop-group">
        <div class="prop-group-title">类别</div>
        <n-form-item label="类别">
          <n-select
            :value="box.label"
            :options="labelOptions"
            size="small"
            @update:value="updateLabel($event)"
          />
        </n-form-item>
      </div>
    </n-form>
  </div>
  <div v-else class="no-selection">
    <span>未选中包围盒</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NForm, NFormItem, NInputNumber, NSelect } from 'naive-ui'
import type { BoundingBox3D } from '@/types'

const props = defineProps<{
  box: BoundingBox3D | null
  categories: { id: number; name: string; color: string }[]
}>()

const emit = defineEmits<{
  update: [updates: Partial<BoundingBox3D>]
}>()

const labelOptions = computed(() =>
  props.categories.map(c => ({ label: c.name, value: c.name }))
)

function updateCenter(axis: 0 | 1 | 2, value: number): void {
  if (!props.box) return
  const center = [...props.box.center] as [number, number, number]
  center[axis] = value
  emit('update', { center })
}

function updateSize(axis: 0 | 1 | 2, value: number): void {
  if (!props.box) return
  const size = [...props.box.size] as [number, number, number]
  size[axis] = value
  emit('update', { size })
}

function updateRotation(value: number): void {
  emit('update', { rotation: value })
}

function updateLabel(value: string): void {
  const cat = props.categories.find(c => c.name === value)
  emit('update', { label: value, color: cat?.color ?? '#808080' })
}
</script>

<style scoped>
.box-properties {
  padding: 8px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
}
.prop-group {
  margin-bottom: 8px;
}
.prop-group-title {
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
  padding-left: 4px;
}
.no-selection {
  padding: 16px 8px;
  color: #555;
  font-size: 12px;
  text-align: center;
}
</style>
