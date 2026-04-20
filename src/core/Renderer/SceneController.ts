import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type PresetView = 'top' | 'front' | 'side'

export class SceneController {
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls

  private readonly INITIAL_POSITION = new THREE.Vector3(0, -30, 20)
  private readonly INITIAL_TARGET = new THREE.Vector3(0, 0, 0)

  // 预设视角配置
  private readonly PRESET_VIEWS: Record<PresetView, { position: THREE.Vector3; target: THREE.Vector3 }> = {
    top: {
      position: new THREE.Vector3(0, 0, 80),
      target: new THREE.Vector3(0, 0, 0),
    },
    front: {
      position: new THREE.Vector3(0, -80, 0),
      target: new THREE.Vector3(0, 0, 0),
    },
    side: {
      position: new THREE.Vector3(80, 0, 0),
      target: new THREE.Vector3(0, 0, 0),
    },
  }

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera
    this.controls = controls

    // 配置 OrbitControls
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 0.1
    this.controls.maxDistance = 1000
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
  }

  /**
   * 切换到预设视角
   */
  setPresetView(view: PresetView): void {
    const preset = this.PRESET_VIEWS[view]
    this.animateTo(preset.position, preset.target)
  }

  /**
   * 将摄像机焦点移动至指定世界坐标
   */
  focusOnPoint(worldPosition: THREE.Vector3): void {
    // 保持当前距离，只移动 target
    const distance = this.camera.position.distanceTo(this.controls.target)
    const direction = this.camera.position.clone()
      .sub(this.controls.target)
      .normalize()
    const newPosition = worldPosition.clone().add(direction.multiplyScalar(distance))
    this.animateTo(newPosition, worldPosition)
  }

  /**
   * 重置视角到初始位置（幂等）
   */
  resetView(): void {
    this.animateTo(
      this.INITIAL_POSITION.clone(),
      this.INITIAL_TARGET.clone()
    )
  }

  /**
   * 每帧更新（需在渲染循环中调用）
   */
  update(): void {
    this.controls.update()
  }

  /**
   * 获取当前相机位置
   */
  getCameraPosition(): THREE.Vector3 {
    return this.camera.position.clone()
  }

  /**
   * 获取当前 target
   */
  getTarget(): THREE.Vector3 {
    return this.controls.target.clone()
  }

  /**
   * 平滑动画过渡到目标位置（简单线性插值，20 帧）
   */
  private animateTo(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3): void {
    const startPosition = this.camera.position.clone()
    const startTarget = this.controls.target.clone()
    const totalFrames = 20
    let frame = 0

    const animate = () => {
      frame++
      const t = Math.min(frame / totalFrames, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic

      this.camera.position.lerpVectors(startPosition, targetPosition, eased)
      this.controls.target.lerpVectors(startTarget, targetLookAt, eased)
      this.controls.update()

      if (frame < totalFrames) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }
}
