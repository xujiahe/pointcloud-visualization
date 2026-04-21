import * as THREE from 'three'

interface OctreeNode {
  bounds: THREE.Box3
  children: OctreeNode[] | null
  indices: Uint32Array
  level: number
}

export class Octree {
  private root: OctreeNode | null = null
  private readonly maxPointsPerNode = 1000
  private readonly maxDepth = 8

  /**
   * 构建八叉树
   */
  build(positions: Float32Array): void {
    const count = positions.length / 3
    const indices = new Uint32Array(count)
    for (let i = 0; i < count; i++) indices[i] = i

    // 计算边界
    const bounds = new THREE.Box3()
    for (let i = 0; i < count; i++) {
      bounds.expandByPoint(new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      ))
    }

    this.root = this.buildNode(bounds, indices, positions, 0)
  }

  /**
   * 查询视锥内的点索引
   */
  queryFrustum(frustum: THREE.Frustum): Uint32Array {
    if (!this.root) return new Uint32Array(0)

    const visibleIndices: number[] = []
    this.queryNode(this.root, frustum, visibleIndices)
    return new Uint32Array(visibleIndices)
  }

  private buildNode(
    bounds: THREE.Box3,
    indices: Uint32Array,
    positions: Float32Array,
    level: number
  ): OctreeNode {
    const node: OctreeNode = {
      bounds: bounds.clone(),
      children: null,
      indices,
      level,
    }

    // 如果点数少于阈值或达到最大深度，不再细分
    if (indices.length <= this.maxPointsPerNode || level >= this.maxDepth) {
      return node
    }

    // 细分八个子节点
    const center = bounds.getCenter(new THREE.Vector3())
    const children: OctreeNode[] = []

    for (let i = 0; i < 8; i++) {
      const childBounds = this.getChildBounds(bounds, center, i)
      const childIndices = this.filterPointsInBounds(childBounds, indices, positions)

      if (childIndices.length > 0) {
        children.push(this.buildNode(childBounds, childIndices, positions, level + 1))
      }
    }

    if (children.length > 0) {
      node.children = children
      node.indices = new Uint32Array(0) // 内部节点不存储点
    }

    return node
  }

  private getChildBounds(parentBounds: THREE.Box3, center: THREE.Vector3, index: number): THREE.Box3 {
    const bounds = new THREE.Box3()
    const min = parentBounds.min
    const max = parentBounds.max

    switch (index) {
      case 0: bounds.set(min, center); break // 左下后
      case 1: bounds.set(new THREE.Vector3(center.x, min.y, min.z), new THREE.Vector3(max.x, center.y, center.z)); break // 右下后
      case 2: bounds.set(new THREE.Vector3(min.x, center.y, min.z), new THREE.Vector3(center.x, max.y, center.z)); break // 左上后
      case 3: bounds.set(new THREE.Vector3(center.x, center.y, min.z), new THREE.Vector3(max.x, max.y, center.z)); break // 右上后
      case 4: bounds.set(new THREE.Vector3(min.x, min.y, center.z), new THREE.Vector3(center.x, center.y, max.z)); break // 左下前
      case 5: bounds.set(new THREE.Vector3(center.x, min.y, center.z), new THREE.Vector3(max.x, center.y, max.z)); break // 右下前
      case 6: bounds.set(new THREE.Vector3(min.x, center.y, center.z), new THREE.Vector3(center.x, max.y, max.z)); break // 左上前
      case 7: bounds.set(center, max); break // 右上前
    }

    return bounds
  }

  private filterPointsInBounds(bounds: THREE.Box3, indices: Uint32Array, positions: Float32Array): Uint32Array {
    const result: number[] = []
    for (const idx of indices) {
      const point = new THREE.Vector3(
        positions[idx * 3],
        positions[idx * 3 + 1],
        positions[idx * 3 + 2]
      )
      if (bounds.containsPoint(point)) {
        result.push(idx)
      }
    }
    return new Uint32Array(result)
  }

  private queryNode(node: OctreeNode, frustum: THREE.Frustum, visibleIndices: number[]): void {
    // 检查节点包围盒是否与视锥相交
    const intersects = frustum.intersectsBox(node.bounds)

    if (!intersects) return

    if (node.children) {
      // 递归查询子节点
      for (const child of node.children) {
        this.queryNode(child, frustum, visibleIndices)
      }
    } else {
      // 叶节点，收集所有点
      for (const idx of node.indices) {
        visibleIndices.push(idx)
      }
    }
  }
}