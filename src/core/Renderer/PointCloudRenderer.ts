import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ParsedPointCloud, ColorMode } from '@/types'
import {
  buildIntensityColors,
  buildHeightColors,
} from './ColorMapping'
import { LODManager } from './LODManager'

export class PointCloudRenderer {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private controls!: OrbitControls
  private pointsMesh: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private animationId: number | null = null
  private lodManager = new LODManager()

  // 性能监控
  private _fps = 0
  private _renderedPointCount = 0
  private _totalPointCount = 0
  private _performanceDegraded = false
  private fpsFrames = 0
  private fpsLastTime = 0
  private fpsSamples: number[] = []  // 3秒滑动窗口

  // 当前数据
  private currentData: ParsedPointCloud | null = null
  private currentColorMode: ColorMode = 'intensity'
  private currentPointSize = 2.0

  // 语义颜色（外部传入）
  private semanticColors: Float32Array | null = null

  get fps(): number { return this._fps }
  get renderedPointCount(): number { return this._renderedPointCount }
  get totalPointCount(): number { return this._totalPointCount }
  get performanceDegraded(): boolean { return this._performanceDegraded }

  init(canvas: HTMLCanvasElement): void {
    // 场景
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    // 相机
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      10000
    )
    this.camera.position.set(0, -30, 20)
    this.camera.lookAt(0, 0, 0)

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    // 轨道控制
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 0.1
    this.controls.maxDistance = 1000

    // 坐标轴辅助
    const axesHelper = new THREE.AxesHelper(5)
    this.scene.add(axesHelper)

    // 网格辅助
    const gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x333333)
    this.scene.add(gridHelper)

    this.fpsLastTime = performance.now()
    this.startRenderLoop()
  }

  loadPointCloud(data: ParsedPointCloud): void {
    this.currentData = data
    this._totalPointCount = data.count
    this.rebuildGeometry()
  }

  setColorMode(mode: ColorMode): void {
    this.currentColorMode = mode
    if (this.currentData) this.rebuildColors()
  }

  setPointSize(size: number): void {
    this.currentPointSize = Math.max(0.5, Math.min(10, size))
    if (this.pointsMesh) {
      (this.pointsMesh.material as THREE.PointsMaterial).size = this.currentPointSize
    }
  }

  updateSemanticColors(colors: Float32Array): void {
    this.semanticColors = colors
    if (this.currentColorMode === 'semantic') {
      this.rebuildColors()
    }
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    this.geometry?.dispose()
    if (this.pointsMesh) {
      (this.pointsMesh.material as THREE.Material).dispose()
    }
    this.renderer?.dispose()
    this.controls?.dispose()
  }

  getCamera(): THREE.PerspectiveCamera { return this.camera }
  getControls(): OrbitControls { return this.controls }
  getScene(): THREE.Scene { return this.scene }

  private rebuildGeometry(): void {
    if (!this.currentData) return

    // 移除旧的点云
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh)
      this.geometry?.dispose()
      ;(this.pointsMesh.material as THREE.Material).dispose()
    }

    const renderCount = this.lodManager.computeRenderCount(
      this.currentData.count,
      this._performanceDegraded
    )
    this._renderedPointCount = renderCount

    // 如果需要 LOD，生成降采样索引
    let positions: Float32Array
    let intensities: Float32Array

    if (renderCount < this.currentData.count) {
      const indices = this.lodManager.buildLODIndex(this.currentData.count, renderCount)
      positions = new Float32Array(renderCount * 3)
      intensities = new Float32Array(renderCount)
      for (let i = 0; i < renderCount; i++) {
        const src = indices[i]
        positions[i * 3]     = this.currentData.positions[src * 3]
        positions[i * 3 + 1] = this.currentData.positions[src * 3 + 1]
        positions[i * 3 + 2] = this.currentData.positions[src * 3 + 2]
        intensities[i]        = this.currentData.intensities[src]
      }
    } else {
      positions = this.currentData.positions
      intensities = this.currentData.intensities
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // 构建颜色
    const colors = this.buildColors(positions, intensities, renderCount)
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: this.currentPointSize,
      vertexColors: true,
      sizeAttenuation: true,
    })

    this.pointsMesh = new THREE.Points(this.geometry, material)
    this.scene.add(this.pointsMesh)
  }

  private rebuildColors(): void {
    if (!this.geometry || !this.currentData) return
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const count = posAttr.count
    const positions = posAttr.array as Float32Array

    // 重建 intensities（从原始数据中取对应点）
    const intensities = new Float32Array(count)
    if (count === this.currentData.count) {
      intensities.set(this.currentData.intensities)
    }

    const colors = this.buildColors(positions, intensities, count)
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    ;(this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  private buildColors(
    positions: Float32Array,
    intensities: Float32Array,
    count: number
  ): Float32Array {
    if (this.currentColorMode === 'intensity') {
      // 检查 intensity 是否全为 0，若是则自动降级到高度映射
      let hasNonZeroIntensity = false
      for (let i = 0; i < count; i++) {
        if (intensities[i] !== 0) { hasNonZeroIntensity = true; break }
      }
      if (hasNonZeroIntensity) {
        return buildIntensityColors(intensities, count)
      }
      // intensity 全为 0，降级到高度映射
      return buildHeightColors(positions, count)
    } else if (this.currentColorMode === 'height') {
      return buildHeightColors(positions, count)
    } else if (this.currentColorMode === 'semantic' && this.semanticColors) {
      return this.semanticColors.slice(0, count * 3)
    }
    // 默认高度映射（比纯白更直观）
    return buildHeightColors(positions, count)
  }

  private startRenderLoop(): void {
    const animate = (time: number) => {
      this.animationId = requestAnimationFrame(animate)

      // FPS 计算
      this.fpsFrames++
      const elapsed = time - this.fpsLastTime
      if (elapsed >= 1000) {
        this._fps = Math.round((this.fpsFrames * 1000) / elapsed)
        this.fpsFrames = 0
        this.fpsLastTime = time

        // 滑动窗口（保留最近 3 个采样，即 3 秒）
        this.fpsSamples.push(this._fps)
        if (this.fpsSamples.length > 3) this.fpsSamples.shift()

        // 性能降级检测
        this.checkPerformanceDegradation()
      }

      this.controls?.update()
      this.renderer.render(this.scene, this.camera)
    }
    this.animationId = requestAnimationFrame(animate)
  }

  private checkPerformanceDegradation(): void {
    if (this.fpsSamples.length < 3) return

    const allLow = this.fpsSamples.every(fps => fps < 20)
    const wasDegrade = this._performanceDegraded

    if (allLow && !wasDegrade) {
      this._performanceDegraded = true
      this.rebuildGeometry()  // 触发降级重建
    } else if (!allLow && wasDegrade) {
      this._performanceDegraded = false
      this.rebuildGeometry()  // 恢复全量渲染
    }
  }
}
