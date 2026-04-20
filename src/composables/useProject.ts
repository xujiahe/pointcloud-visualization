import { ref, computed, shallowRef } from 'vue'
import { ProjectStore } from '@/stores/ProjectStore'
import type { ProjectData, FrameRecord, BoundingBox3D } from '@/types'

const store = new ProjectStore()

export function useProject() {
  const currentProject = ref<ProjectData | null>(null)
  const currentFrame = shallowRef<FrameRecord | null>(null)
  const isSaving = ref(false)
  const isExporting = ref(false)

  const frames = computed(() => currentProject.value?.frames ?? [])
  const frameCount = computed(() => frames.value.length)

  // 应用启动时自动恢复上次项目
  function restoreLastProject(): void {
    const lastId = store.getLastProjectId()
    if (lastId) {
      const project = store.load(lastId)
      if (project) {
        currentProject.value = project
        if (project.currentFrameId) {
          currentFrame.value = project.frames.find(f => f.id === project.currentFrameId) ?? null
        }
      }
    }
  }

  function createProject(name: string): ProjectData {
    const project = store.createProject(name)
    currentProject.value = project
    currentFrame.value = null
    return project
  }

  function loadProject(projectId: string): ProjectData | null {
    const project = store.load(projectId)
    if (project) {
      currentProject.value = project
      if (project.currentFrameId) {
        currentFrame.value = project.frames.find(f => f.id === project.currentFrameId) ?? null
      }
    }
    return project
  }

  function addFrame(url: string, name: string): FrameRecord {
    if (!currentProject.value) throw new Error('No active project')
    const frame: FrameRecord = {
      id: crypto.randomUUID(),
      name,
      url,
      status: 'unlabeled',
      boundingBoxes: [],
    }
    currentProject.value = store.addFrame(currentProject.value, frame)
    return frame
  }

  function switchFrame(frameId: string): FrameRecord | null {
    if (!currentProject.value) return null
    const frame = currentProject.value.frames.find(f => f.id === frameId) ?? null
    currentFrame.value = frame
    // 更新当前帧 ID
    currentProject.value = {
      ...currentProject.value,
      currentFrameId: frameId,
    }
    store.save(currentProject.value)
    return frame
  }

  function saveAnnotations(
    frameId: string,
    boundingBoxes: BoundingBox3D[],
    semanticLabels?: number[]
  ): void {
    if (!currentProject.value) return
    const status = store.computeFrameStatus({
      id: frameId,
      name: '',
      status: 'in-progress',
      boundingBoxes,
      semanticLabels,
    })
    currentProject.value = store.updateFrame(currentProject.value, frameId, {
      boundingBoxes,
      semanticLabels,
      status,
    })
    if (currentFrame.value?.id === frameId) {
      currentFrame.value = currentProject.value.frames.find(f => f.id === frameId) ?? null
    }
  }

  function markFrameCompleted(frameId: string): void {
    if (!currentProject.value) return
    currentProject.value = store.updateFrame(currentProject.value, frameId, {
      status: 'completed',
    })
  }

  function saveProject(): void {
    if (!currentProject.value) return
    isSaving.value = true
    try {
      store.save(currentProject.value)
    } finally {
      isSaving.value = false
    }
  }

  async function exportZip(): Promise<void> {
    if (!currentProject.value) return
    isExporting.value = true
    try {
      const blob = await store.exportZip(currentProject.value)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentProject.value.name}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      isExporting.value = false
    }
  }

  function listProjects(): ProjectData[] {
    return store.listProjects()
  }

  return {
    currentProject,
    currentFrame,
    frames,
    frameCount,
    isSaving,
    isExporting,
    restoreLastProject,
    createProject,
    loadProject,
    addFrame,
    switchFrame,
    saveAnnotations,
    markFrameCompleted,
    saveProject,
    exportZip,
    listProjects,
  }
}
