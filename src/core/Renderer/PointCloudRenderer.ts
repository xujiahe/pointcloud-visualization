import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ParsedPointCloud, ColorMode } from '@/types'
import {
  buildIntensityColors,
  buildHeightColors,
} from './ColorMapping'
import { LODManager } from './LODManager'
import { FrustumCuller } from './FrustumCuller'
import { Octree } from './Octree'

// Shader 代码
const vertexShader = `
attribute float intensity;
attribute float height;
uniform int uColorMode;      // 0=intensity 1=height 2=semantic
uniform float uMinVal;
uniform float uMaxVal;
uniform float uPointSize;

varying vec3 vColor;

vec3 jetColormap(float v) {
  v = clamp(v, 0.0, 1.0);
  return vec3(
    clamp(1.5 - abs(4.0*v - 3.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*v - 2.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*v - 1.0), 0.0, 1.0)
  );
}

void main() {
  float raw = (uColorMode == 0) ? intensity : height;
  float normalized = (uMaxVal > uMinVal)
    ? (raw - uMinVal) / (uMaxVal - uMinVal)
    : 0.0;
  vColor = jetColormap(normalized);

  gl_PointSize = uPointSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
varying vec3 vColor;

void main() {
  // 圆形点（可选）
  float r = distance(gl_PointCoord, vec2(0.5, 0.5));
  if (r > 0.5) discard;

  gl_FragColor = vec4(vColor, 1.0);
}
`

export class PointCloudRenderer {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private controls!: OrbitControls
  private pointsMesh: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private animationId: number | null = null
  private lodManager = new LODManager()
  private frustumCuller = new FrustumCuller()
  private octree = new Octree()

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

  // 视锥裁剪相关
  private needsFrustumUpdate = false

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

    // 监听相机变化
    this.controls.addEventListener('change', () => {
      this.needsFrustumUpdate = true
    })

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

    // 构建八叉树（一次性）
    this.octree.build(data.positions)

    this.rebuildGeometry()
  }

  setColorMode(mode: ColorMode): void {
    this.currentColorMode = mode
    this.updateShaderUniforms()
  }

  setPointSize(size: number): void {
    this.currentPointSize = Math.max(0.5, Math.min(10, size))
    if (this.pointsMesh) {
      const material = this.pointsMesh.material
      if (material instanceof THREE.PointsMaterial) {
        material.size = this.currentPointSize
      } else if (material instanceof THREE.ShaderMaterial) {
        material.uniforms.uPointSize.value = this.currentPointSize
      }
    }
  }

  updateSemanticColors(colors: Float32Array): void {
    this.semanticColors = colors
    // 对于 semantic 模式，需要重建 geometry 以使用 PointsMaterial
    if (this.currentColorMode === 'semantic') {
      this.rebuildGeometry()
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

    // 更新视锥
    this.frustumCuller.update(this.camera)

    // 获取可见点索引
    const visibleIndices = this.octree.queryFrustum(this.frustumCuller['frustum'])

    // 应用 LOD 到可见点
    const lodIndices = this.lodManager.buildLODIndex(visibleIndices.length, 
      this.lodManager.computeRenderCount(visibleIndices.length, this._performanceDegraded))

    // 映射回原始索引
    const finalIndices = new Uint32Array(lodIndices.length)
    for (let i = 0; i < lodIndices.length; i++) {
      finalIndices[i] = visibleIndices[lodIndices[i]]
    }

    this._renderedPointCount = finalIndices.length

    // 构建 geometry
    const positions = new Float32Array(finalIndices.length * 3)
    const intensities = new Float32Array(finalIndices.length)
    const heights = new Float32Array(finalIndices.length)

    for (let i = 0; i < finalIndices.length; i++) {
      const src = finalIndices[i]
      positions[i * 3]     = this.currentData.positions[src * 3]
      positions[i * 3 + 1] = this.currentData.positions[src * 3 + 1]
      positions[i * 3 + 2] = this.currentData.positions[src * 3 + 2]
      intensities[i]        = this.currentData.intensities[src]
      heights[i]            = this.currentData.positions[src * 3 + 2]
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // 构建颜色或设置 shader uniforms
    let material: THREE.Material
    if (this.currentColorMode === 'semantic' && this.semanticColors) {
      // Semantic 模式使用 PointsMaterial
      const colors = this.buildColors(positions, intensities, finalIndices.length)
      this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      material = new THREE.PointsMaterial({
        size: this.currentPointSize,
        vertexColors: true,
        sizeAttenuation: true,
      })
    } else {
      // 其他模式使用 ShaderMaterial
      this.geometry.setAttribute('intensity', new THREE.BufferAttribute(intensities, 1))
      this.geometry.setAttribute('height', new THREE.BufferAttribute(heights, 1))

      const colorRanges = this.computeColorRanges(intensities, heights)
      material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColorMode: { value: this.getColorModeIndex(this.currentColorMode) },
          uMinVal: { value: colorRanges.min },
          uMaxVal: { value: colorRanges.max },
          uPointSize: { value: this.currentPointSize },
        },
      })
    }

    this.pointsMesh = new THREE.Points(this.geometry, material)
    this.scene.add(this.pointsMesh)
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

      // 视锥裁剪更新
      if (this.needsFrustumUpdate && this.currentData) {
        this.rebuildGeometry()
        this.needsFrustumUpdate = false
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

  private computeColorRanges(intensities: Float32Array, heights: Float32Array): { min: number, max: number } {
    if (this.currentColorMode === 'intensity') {
      let min = Infinity, max = -Infinity
      for (let i = 0; i < intensities.length; i++) {
        min = Math.min(min, intensities[i])
        max = Math.max(max, intensities[i])
      }
      return { min, max }
    } else if (this.currentColorMode === 'height') {
      let min = Infinity, max = -Infinity
      for (let i = 0; i < heights.length; i++) {
        min = Math.min(min, heights[i])
        max = Math.max(max, heights[i])
      }
      return { min, max }
    }
    return { min: 0, max: 1 }
  }

  private getColorModeIndex(mode: ColorMode): number {
    switch (mode) {
      case 'intensity': return 0
      case 'height': return 1
      case 'semantic': return 2
      default: return 0
    }
  }

  private updateShaderUniforms(): void {
    if (!this.pointsMesh || !(this.pointsMesh.material instanceof THREE.ShaderMaterial)) return

    const material = this.pointsMesh.material as THREE.ShaderMaterial
    material.uniforms.uColorMode.value = this.getColorModeIndex(this.currentColorMode)

    if (this.geometry) {
      const intensities = (this.geometry.getAttribute('intensity') as THREE.BufferAttribute).array as Float32Array
      const heights = (this.geometry.getAttribute('height') as THREE.BufferAttribute).array as Float32Array
      const ranges = this.computeColorRanges(intensities, heights)
      material.uniforms.uMinVal.value = ranges.min
      material.uniforms.uMaxVal.value = ranges.max
    }
  }
}
