import * as THREE from 'three'

export class FrustumCuller {
  private frustum = new THREE.Frustum()
  private projScreenMatrix = new THREE.Matrix4()
  private point = new THREE.Vector3()

  /**
   * 更新视锥体（每帧调用）
   */
  update(camera: THREE.Camera): void {
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix)
  }

  /**
   * 对点云进行视锥体裁剪
   * @param positions Float32Array [x0,y0,z0, x1,y1,z1, ...]
   * @returns Uint8Array 可见点掩码（1=可见，0=不可见）
   */
  cull(positions: Float32Array): Uint8Array {
    const count = Math.floor(positions.length / 3)
    const mask = new Uint8Array(count)

    for (let i = 0; i < count; i++) {
      this.point.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      )
      mask[i] = this.frustum.containsPoint(this.point) ? 1 : 0
    }

    return mask
  }

  /**
   * 获取可见点的索引数组
   */
  getVisibleIndices(positions: Float32Array): Uint32Array {
    const mask = this.cull(positions)
    const visibleCount = mask.reduce((sum, v) => sum + v, 0)
    const indices = new Uint32Array(visibleCount)
    let idx = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) indices[idx++] = i
    }
    return indices
  }
}
