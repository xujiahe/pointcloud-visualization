export class LODManager {
  private readonly LOD_THRESHOLD = 5_000_000
  private readonly DEGRADATION_RATIO = 0.5

  /**
   * 计算应渲染的点数
   * @param totalPoints 总点数
   * @param performanceDegraded 是否处于性能降级模式
   */
  computeRenderCount(
    totalPoints: number,
    performanceDegraded: boolean
  ): number {
    if (totalPoints <= 0) return 0

    let targetCount = totalPoints

    // LOD：超过阈值时降采样
    if (totalPoints > this.LOD_THRESHOLD) {
      targetCount = Math.floor(totalPoints * this.DEGRADATION_RATIO)
    }

    // 性能降级：额外减少 50%
    if (performanceDegraded) {
      targetCount = Math.floor(targetCount * this.DEGRADATION_RATIO)
    }

    return Math.max(1, targetCount)
  }

  /**
   * 判断 LOD 是否应激活
   */
  isLODActive(totalPoints: number): boolean {
    return totalPoints > this.LOD_THRESHOLD
  }

  /**
   * 生成均匀跳采索引
   * @param totalPoints 总点数
   * @param targetCount 目标点数
   */
  buildLODIndex(totalPoints: number, targetCount: number): Uint32Array {
    if (targetCount >= totalPoints) {
      // 不需要降采样，返回全量索引
      const indices = new Uint32Array(totalPoints)
      for (let i = 0; i < totalPoints; i++) indices[i] = i
      return indices
    }

    const indices = new Uint32Array(targetCount)
    const step = totalPoints / targetCount
    for (let i = 0; i < targetCount; i++) {
      indices[i] = Math.floor(i * step)
    }
    return indices
  }
}
