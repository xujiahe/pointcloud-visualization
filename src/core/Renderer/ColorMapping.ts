/**
 * Jet colormap 颜色映射
 * 将 [0,1] 范围的值映射为 RGB 颜色（归一化 0-1）
 */
export function jetColormap(value: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, value))
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 3)))
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 2)))
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 1)))
  return [r, g, b]
}

/**
 * 强度值映射：将强度值归一化后应用 Jet colormap
 * @param intensity 强度值（任意范围）
 * @param minIntensity 最小强度值
 * @param maxIntensity 最大强度值
 */
export function intensityToColor(
  intensity: number,
  minIntensity = 0,
  maxIntensity = 1
): [number, number, number] {
  const range = maxIntensity - minIntensity
  const normalized = range === 0 ? 0 : (intensity - minIntensity) / range
  return jetColormap(normalized)
}

/**
 * 高度映射：将 z 坐标线性映射到 [zMin, zMax] 区间，再应用 Jet colormap
 * @param z z 坐标值
 * @param zMin 最小 z 值
 * @param zMax 最大 z 值
 */
export function heightToColor(
  z: number,
  zMin: number,
  zMax: number
): [number, number, number] {
  const range = zMax - zMin
  const normalized = range === 0 ? 0 : (z - zMin) / range
  return jetColormap(normalized)
}

/**
 * 将十六进制颜色字符串转换为归一化 RGB 数组
 * @param hex '#RRGGBB' 格式
 */
export function hexToRgbNormalized(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

/**
 * 生成点云的颜色数组（基于强度模式）
 */
export function buildIntensityColors(
  intensities: Float32Array,
  count: number
): Float32Array {
  const colors = new Float32Array(count * 3)
  let minI = Infinity, maxI = -Infinity
  for (let i = 0; i < count; i++) {
    if (intensities[i] < minI) minI = intensities[i]
    if (intensities[i] > maxI) maxI = intensities[i]
  }
  for (let i = 0; i < count; i++) {
    const [r, g, b] = intensityToColor(intensities[i], minI, maxI)
    colors[i * 3]     = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  return colors
}

/**
 * 生成点云的颜色数组（基于高度模式）
 */
export function buildHeightColors(
  positions: Float32Array,
  count: number
): Float32Array {
  const colors = new Float32Array(count * 3)
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < count; i++) {
    const z = positions[i * 3 + 2]
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  for (let i = 0; i < count; i++) {
    const z = positions[i * 3 + 2]
    const [r, g, b] = heightToColor(z, minZ, maxZ)
    colors[i * 3]     = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  return colors
}
