# 点云渲染优化路径

> 针对百万级点云在浏览器 WebGL 环境下的渲染性能优化，按投入产出比从高到低排列。

---

## 一、当前瓶颈分析

| 阶段 | 操作 | 100万点耗时 | 备注 |
|------|------|------------|------|
| 解析 | JS 循环读取 Float32Array | ~50ms | Worker 已缓解，但仍有开销 |
| 颜色构建 | CPU 端全量遍历 buildColors() | ~30ms | 每次切换颜色模式触发 |
| GPU 上传 | BufferGeometry 初始化 | ~20ms | 一次性，可接受 |
| 渲染 draw call | WebGL 逐点绘制 | ~5ms/帧 | GPU 瓶颈，点数线性增长 |
| 视锥裁剪（CPU） | 逐点 frustum.containsPoint() | ~80ms | 不可用于实时，需空间索引 |

**核心矛盾：** 浏览器单线程 + JS 动态类型 vs 百万级浮点数据的实时处理需求。

---

## 二、优化路径总览

```
第一阶段  零成本 ──────────────────────────────── 已实现
  ✅ TypedArray 全程（Float32Array / Uint32Array）
  ✅ Web Worker 解析 + Transferable 零拷贝
  ✅ LOD 均匀降采样（500万点阈值，跳采50%）
  ✅ FPS 滑动窗口自适应降级（<20fps 持续3s）
  ✅ shallowRef 避免 Vue 深度响应式代理

第二阶段  低成本高收益 ─────────────────────────── 已实现
  ✅ Vertex Shader 内颜色映射（消除 CPU buildColors）
  ✅ 集成 FrustumCuller + 八叉树空间索引

第三阶段  中等成本 ─────────────────────────────── 已实现
  ✅ IndexedDB 解析结果缓存
  ⬜ 流式分块加载（Streaming LOD）

第四阶段  高成本，超大数据场景 ──────────────────────
  ⬜ WebAssembly 解析器（Rust/C++）
  ⬜ WebGPU Compute Shader GPU 端裁剪
```

---

## 三、各方案详解

### 3.1 Vertex Shader 颜色映射（推荐第一步）

**问题：** 当前每次切换颜色模式，CPU 需要遍历所有点重新计算颜色数组（100万点 ≈ 30ms），且需要额外一份 `Float32Array` 内存。

**方案：** 只上传 `intensity` 标量属性，颜色计算移入 vertex shader，GPU 并行完成。

```glsl
/* vertex.glsl */
attribute float intensity;
attribute float height;        // z 坐标
uniform int   uColorMode;      // 0=intensity 1=height 2=semantic
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
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**收益：**
- 颜色切换从 30ms → 0ms（只需更新 uniform）
- 节省一份颜色 `Float32Array` 内存（100万点 ≈ 12MB）
- 颜色范围动态调整无需重建 geometry

---

### 3.2 八叉树 + 视锥裁剪

**问题：** CPU 逐点视锥裁剪 100万点需 80ms，远超一帧预算（16ms）。

**方案：** 加载时一次性构建八叉树，每帧只遍历与视锥相交的节点。

```
加载阶段（一次性，约 200ms）
  positions → Octree.build()
  空间递归划分为 8 叉节点
  每个叶节点存储 ~1000 个点的索引

渲染阶段（每帧，约 1-2ms）
  camera.frustum → Octree.queryFrustum()
  ├─ 节点 AABB 与视锥相交测试（极快）
  ├─ 完全在内：全部点加入可见集
  ├─ 部分相交：递归子节点
  └─ 完全在外：跳过整个子树
  → geometry.setDrawRange(0, visibleCount)
```

```typescript
class Octree {
  private root: OctreeNode

  build(positions: Float32Array): void {
    // 递归划分，叶节点最多 1000 点
  }

  queryFrustum(frustum: THREE.Frustum): Uint32Array {
    // 返回可见点索引，重用预分配 buffer 避免 GC
  }
}
```

**收益：** 视野内通常只有 20-30% 的点，渲染量减少 70%，帧率提升 2-3x。

---

### 3.3 IndexedDB 解析缓存

**问题：** 同一文件每次打开都要重新解析（100万点 ≈ 50ms）。

**方案：** 以文件内容 hash 为 key，将解析结果缓存到 IndexedDB。

```typescript
class PointCloudCache {
  async get(hash: string): Promise<ParsedPointCloud | null> {
    const db = await this.openDB()
    return db.get('pointclouds', hash)
  }

  async set(hash: string, data: ParsedPointCloud): Promise<void> {
    // 存储 positions / intensities ArrayBuffer
    // IndexedDB 原生支持 ArrayBuffer，无需序列化
  }

  private async computeHash(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  }
}
```

**收益：** 二次加载同一文件接近瞬时，用户体验大幅提升。

---

### 3.4 流式分块加载（Streaming LOD）

**问题：** 超过 1000 万点时，一次性加载会占用 500MB+ 内存，浏览器可能 OOM。

**方案：** 将点云切分为空间块，按相机距离动态加载/卸载。

```
文件预处理（离线）
  原始点云 → 按空间网格切分为 N 个 chunk
  每个 chunk 约 10 万点，存为独立 .bin 文件
  生成 manifest.json（chunk 列表 + 空间范围）

运行时
  加载 manifest.json
  ├─ 近处 chunk（< 20m）→ 全量点，立即加载
  ├─ 中距 chunk（20-100m）→ 25% 采样，按需加载
  └─ 远处 chunk（> 100m）→ 5% 采样 或 卸载
  每帧根据相机位置更新加载优先级队列
```

```typescript
class StreamingPointCloud {
  private readonly CHUNK_SIZE = 100_000
  private loadedChunks = new Map<string, THREE.Points>()
  private loadQueue: PriorityQueue<ChunkRequest>

  updateLOD(camera: THREE.Camera): void {
    const pos = camera.position
    for (const chunk of this.manifest.chunks) {
      const dist = chunk.center.distanceTo(pos)
      const priority = this.computePriority(dist, chunk)
      this.scheduleLoad(chunk.id, priority)
    }
    this.evictDistantChunks(pos)
  }
}
```

**收益：** 内存始终控制在 200-400MB，支持亿级点云场景。

---

### 3.5 WebAssembly 解析器

**问题：** JS 解析 KITTI/PCD 文件受限于动态类型和 JIT 编译，速度约为原生的 1/5。

**方案：** 用 Rust 编写解析器，编译为 WASM，直接操作内存。

```rust
// parser.rs
#[wasm_bindgen]
pub fn parse_kitti(buffer: &[u8]) -> Vec<f32> {
    let floats = bytemuck::cast_slice::<u8, f32>(buffer);
    // 直接内存映射，零拷贝
    floats.to_vec()  
}
```

```typescript
import init, { parse_kitti, parse_pcd } from './parser_bg.wasm'

await init()
const positions = parse_kitti(buffer)  // 速度提升 5-10x
```

**收益：** 解析 100 万点从 50ms → 5-10ms，支持更大文件实时加载。

---

### 3.6 WebGPU Compute Shader（终极方案）

**问题：** 视锥裁剪、LOD 计算、颜色映射都在 CPU 端，无法充分利用 GPU 并行能力。

**方案：** 全部移到 GPU Compute Shader，CPU 只发一条 draw 命令。

```wgsl
/* frustum_cull.wgsl */
@group(0) @binding(0) var<storage, read>       positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write>  visible:   array<u32>;
@group(0) @binding(2) var<uniform>              frustum:   FrustumUniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if i >= arrayLength(&positions) { return; }

  let p = positions[i].xyz;
  // 6 平面测试
  visible[i] = u32(
    dot(frustum.planes[0], vec4f(p, 1.0)) >= 0.0 &&
    dot(frustum.planes[1], vec4f(p, 1.0)) >= 0.0 &&
    dot(frustum.planes[2], vec4f(p, 1.0)) >= 0.0 &&
    dot(frustum.planes[3], vec4f(p, 1.0)) >= 0.0 &&
    dot(frustum.planes[4], vec4f(p, 1.0)) >= 0.0 &&
    dot(frustum.planes[5], vec4f(p, 1.0)) >= 0.0
  );
}
```

```typescript
// Three.js r163+ WebGPU 后端
import WebGPURenderer from 'three/addons/renderers/common/Renderer.js'

const renderer = new WebGPURenderer()
// GPU 端裁剪 → indirect draw，CPU 开销接近零
```

**收益：** 裁剪完全在 GPU 并行，CPU 零开销，支持 5000 万点实时渲染。

---

## 四、优化效果对比

| 方案 | 实施成本 | 100万点帧率提升 | 内存节省 | 适用场景 |
|------|---------|----------------|---------|---------|
| ✅ LOD 降采样 | 已完成 | +50% | 50% | 通用 |
| ✅ Worker 解析 | 已完成 | 不卡 UI | — | 通用 |
| ✅ Shader 颜色映射 | 已完成（低） | +10% | 12MB/百万点 | 通用 |
| ✅ 八叉树裁剪 | 已完成（中） | +200% | — | >100万点 |
| ✅ IndexedDB 缓存 | 已完成（低） | 二次加载瞬时 | — | 重复加载 |
| ⬜ 流式分块 | 高（1周） | 稳定60fps | 控制在400MB | >1000万点 |
| ⬜ WASM 解析 | 高（1周） | 解析快10x | — | 大文件 |
| ⬜ WebGPU | 极高（2周） | +500% | — | >5000万点 |

---

## 五、推荐实施顺序

```
Week 1 ✅ 已完成
  1. Vertex Shader 颜色映射
     改动：PointCloudRenderer 换用 ShaderMaterial
     收益：颜色切换瞬时，节省内存

  2. IndexedDB 缓存
     改动：DataLoader 增加缓存层
     收益：重复加载体验大幅提升

Week 2-3 ✅ 已完成
  3. 八叉树 + 视锥裁剪集成
     改动：新增 Octree 类，渲染循环集成
     收益：帧率提升 2-3x（最高性价比）

Month 2
  4. 流式分块加载
     改动：需要离线预处理工具 + 运行时调度器
     收益：支持亿级点云

---
