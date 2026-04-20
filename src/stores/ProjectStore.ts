import JSZip from 'jszip'
import type { ProjectData, FrameRecord } from '@/types'
import { LabelManager } from '@/core/Annotation/LabelManager'

const PROJECT_KEY_PREFIX = 'pointcloud-project-'
const LAST_PROJECT_KEY = 'pointcloud-last-project-id'

export class ProjectStore {
  /**
   * 保存项目到 localStorage
   */
  save(project: ProjectData): void {
    const key = `${PROJECT_KEY_PREFIX}${project.id}`
    const updated = { ...project, updatedAt: Date.now() }
    localStorage.setItem(key, JSON.stringify(updated))
    localStorage.setItem(LAST_PROJECT_KEY, project.id)
  }

  /**
   * 从 localStorage 加载项目
   */
  load(projectId: string): ProjectData | null {
    const key = `${PROJECT_KEY_PREFIX}${projectId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ProjectData
    } catch {
      return null
    }
  }

  /**
   * 列出所有已保存的项目
   */
  listProjects(): ProjectData[] {
    const projects: ProjectData[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PROJECT_KEY_PREFIX)) {
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            projects.push(JSON.parse(raw) as ProjectData)
          } catch {
            // 跳过损坏的数据
          }
        }
      }
    }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 删除项目
   */
  delete(projectId: string): void {
    localStorage.removeItem(`${PROJECT_KEY_PREFIX}${projectId}`)
    if (localStorage.getItem(LAST_PROJECT_KEY) === projectId) {
      localStorage.removeItem(LAST_PROJECT_KEY)
    }
  }

  /**
   * 获取上次打开的项目 ID
   */
  getLastProjectId(): string | null {
    return localStorage.getItem(LAST_PROJECT_KEY)
  }

  /**
   * 创建新项目
   */
  createProject(name: string): ProjectData {
    const lm = new LabelManager()
    const project: ProjectData = {
      id: crypto.randomUUID(),
      name,
      frames: [],
      categories: lm.exportCategories(),
      currentFrameId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.save(project)
    return project
  }

  /**
   * 添加帧到项目
   */
  addFrame(project: ProjectData, frame: FrameRecord): ProjectData {
    const updated = {
      ...project,
      frames: [...project.frames, frame],
      updatedAt: Date.now(),
    }
    this.save(updated)
    return updated
  }

  /**
   * 更新帧数据
   */
  updateFrame(project: ProjectData, frameId: string, updates: Partial<FrameRecord>): ProjectData {
    const updated = {
      ...project,
      frames: project.frames.map(f =>
        f.id === frameId ? { ...f, ...updates } : f
      ),
      updatedAt: Date.now(),
    }
    this.save(updated)
    return updated
  }

  /**
   * 导出项目为 ZIP 压缩包
   * 包含所有帧的 JSON（包围盒）和 .label（语义标签）文件
   */
  async exportZip(project: ProjectData): Promise<Blob> {
    const zip = new JSZip()
    const lm = new LabelManager()
    lm.importProject(project)

    for (const frame of project.frames) {
      const frameDir = zip.folder(frame.name) ?? zip

      // 导出包围盒 JSON
      const jsonContent = lm.exportBoundingBoxesJSON(frame.boundingBoxes, frame.id)
      frameDir.file(`${frame.name}.json`, jsonContent)

      // 导出语义标签二进制（如果有）
      if (frame.semanticLabels && frame.semanticLabels.length > 0) {
        // 从稀疏格式恢复完整标签数组
        // 需要知道点数，从稀疏数据中推断最大索引
        const maxIdx = frame.semanticLabels.reduce((max, val, i) =>
          i % 2 === 0 ? Math.max(max, val) : max, 0)
        const pointCount = maxIdx + 1

        lm.importSparseLabels(frame.semanticLabels, pointCount)
        const labelBuffer = lm.exportSemanticLabelsBinary()
        frameDir.file(`${frame.name}.label`, labelBuffer)
      }
    }

    // 导出项目元数据
    const metadata = {
      id: project.id,
      name: project.name,
      categories: project.categories,
      frameCount: project.frames.length,
      exportedAt: new Date().toISOString(),
    }
    zip.file('project.json', JSON.stringify(metadata, null, 2))

    return zip.generateAsync({ type: 'blob' })
  }

  /**
   * 计算帧的标注状态
   */
  computeFrameStatus(frame: FrameRecord): FrameRecord['status'] {
    const hasBoxes = frame.boundingBoxes.length > 0
    const hasLabels = frame.semanticLabels && frame.semanticLabels.length > 0
    if (!hasBoxes && !hasLabels) return 'unlabeled'
    if (frame.status === 'completed') return 'completed'
    return 'in-progress'
  }
}
