# PointCloud Viewer — 架构文档

> 技术栈：Vue 3 + TypeScript + Three.js + Vite + Naive UI

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Vue 3 UI 层                          │
│  App.vue → MainLayout → PointCloudCanvas / ToolBar / ...    │
└────────────────────────┬────────────────────────────────────┘
                         │ props / emit / expose
┌────────────────────────▼────────────────────────────────────┐
│                     Composables 层                          │
│   usePointCloud  │  useAnnotation  │  useScene  │ useProject│
└──────┬───────────┴────────┬────────┴─────┬──────┴──────────┘
       │                    │              │
┌──────▼──────┐  ┌──────────▼──────┐  ┌───▼──────────────────┐
│  DataLoader │  │AnnotationHistory│  │  PointCloudRenderer  │
│  KITTIParser│  │ BoundingBoxTool │  │  SceneController     │
│  PCDParser  │  │ SemanticBrush   │  │  LODManager          │
│  Worker     │  │ RectSelectTool  │  │  FrustumCuller       │
└─────────────┘  └─────────────────┘  └──────────────────────┘
       │                                        │
┌──────▼──────────────────────────────────────▼──────────────┐
│                    数据 / 存储层                             │
│          ProjectStore (localStorage + JSZip)               │
│          LabelManager (语义标签 + 颜色映射)                  │
└─────────────────────────────────────────────────────────────┘
```

### 分层职责

| 层次 | 模块 | 职责 |
|------|------|------|
| UI 层 | `*.vue` 组件 | 渲染界面、响应用户交互 |
| Composables 层 | `use*.ts` | 封装业务逻辑，连接 UI 与 Core |
| Core 层 | `src/core/*.ts` | 纯逻辑，不依赖 Vue |
| Worker 层 | `pointcloud.worker.ts` | 离线解析，不阻塞主线程 |
| 存储层 | `ProjectStore` | 持久化项目数据 |

---

## 二、核心模块详解

### 2.1 数据加载管道

```
File / URL
    │
    ▼
DataLoader.loadFromFile / loadFromURL
    │  格式检测（.bin → KITTI，.pcd → PCD）
    │  进度回调 / AbortSignal 支持
    ▼
KITTIParser / PCDParser
    │  解析为 ParsedPointCloud
    │  { positions: Float32Array, intensities: Float32Array, count }
    ▼
pointcloud.worker.ts（可选离线解析）
    │  Transferable Objects 零拷贝传输
    ▼
usePointCloud composable
    │  shallowRef<ParsedPointCloud>
    ▼
PointCloudCanvas → useScene → PointCloudRenderer
```

**关键设计：**
- `DataLoader` 支持 `AbortSignal` 取消和超时（10s）
- Worker 使用 `transfer` 传输 `ArrayBuffer`，避免内存拷贝
- `shallowRef` 避免 Vue 对大型 TypedArray 做深度响应式代理

### 2.2 渲染管道

```
ParsedPointCloud
    │
    ▼
LODManager.computeRenderCount()
    │  总点数 > 500万 → 降采样 50%
    │  FPS < 20 持续 3s → 再降 50%
    ▼
LODManager.buildLODIndex()
    │  均匀跳采（step = total / target）
    ▼
colorMapping（intensity / height / semantic）
    │  Jet colormap 映射
    ▼
THREE.BufferGeometry（position + color 属性）
    │
    ▼
THREE.Points + PointsMaterial（vertexColors）
    │
    ▼
WebGLRenderer.render()
```

**关键设计：**
- 所有点数据存储为 `Float32Array`，直接绑定 GPU Buffer
- 颜色模式切换只重建颜色属性，不重建几何体
- FPS 滑动窗口（3 秒）防止抖动触发误降级

### 2.3 标注系统

```
useAnnotation
    ├── AnnotationHistory（Command 模式，Undo/Redo，最大 50 步）
    ├── BoundingBoxTool   → 3D 包围盒绘制 / 选择 / 编辑
    ├── SemanticBrushTool → 笔刷语义标注
    └── RectSelectTool    → 矩形框选语义标注

LabelManager
    ├── pointLabels: Uint32Array（每点一个类别 ID）
    ├── buildSemanticColors() → Float32Array（RGB）
    ├── exportBoundingBoxesJSON()
    └── exportSemanticLabelsBinary()（uint32 小端序）
```

**Command 模式实现：**
```typescript
interface Command {
  execute(): void
  undo(): void
}
// AnnotationHistory 维护 undoStack / redoStack
// 每次 execute 清空 redoStack，保证历史一致性
```

### 2.4 场景控制

```
SceneController
    ├── setPresetView('top' | 'front' | 'side')
    ├── focusOnPoint(worldPosition)  // 保持距离，移动 target
    ├── resetView()
    └── animateTo()  // ease-out cubic，20 帧平滑过渡

OrbitControls
    ├── LEFT: ROTATE
    ├── MIDDLE: DOLLY
    └── RIGHT: PAN
```

### 2.5 项目持久化

```
ProjectStore（localStorage）
    ├── createProject / save / load / delete
    ├── addFrame / updateFrame
    └── exportZip()  // JSZip 打包
            ├── {frame}/{frame}.json  （包围盒）
            └── {frame}/{frame}.label （语义标签二进制）
```

---

## 三、关键数据结构

```typescript
// 点云原始数据（解析后）
interface ParsedPointCloud {
  positions:   Float32Array  // [x0,y0,z0, x1,y1,z1, ...]
  intensities: Float32Array  // [i0, i1, ...]
  count:       number
}

// 3D 包围盒
interface BoundingBox3D {
  id:       string
  center:   [number, number, number]  // x, y, z (米)
  size:     [number, number, number]  // length, width, height
  rotation: number                    // yaw（弧度，绕 Z 轴）
  label:    string
  color:    string
}

// 项目数据（持久化）
interface ProjectData {
  id:             string
  frames:         FrameRecord[]
  categories:     SemanticCategory[]
  currentFrameId: string | null
}
```

---

## 四、性能优化策略

### 4.1 已实现的优化

| 优化点 | 实现方式 | 效果 |
|--------|----------|------|
| TypedArray | `Float32Array` / `Uint32Array` 全程 | 内存紧凑，GPU 直传 |
| Worker 解析 | `pointcloud.worker.ts` + Transferable | 不阻塞主线程 |
| LOD 降采样 | 均匀跳采，500万点阈值 | 渲染点数减半 |
| 自适应降级 | FPS < 20 持续 3s 触发 | 动态保帧 |
| shallowRef | 大型 TypedArray 不做深度代理 | 避免 Vue 响应式开销 |
| 颜色增量更新 | 切换颜色模式只更新 color 属性 | 避免重建几何体 |
| 零拷贝传输 | Worker postMessage transfer | 消除 ArrayBuffer 复制 |
| 视锥体裁剪 | `FrustumCuller`（已实现，待集成） | 剔除不可见点 |

---

## 五、百万级点云优化方案

### 5.1 当前瓶颈分析

| 阶段 | 瓶颈 | 量级 |
|------|------|------|
| 解析 | 主线程 JS 循环 | 100万点 ≈ 50ms |
| 颜色构建 | 全量遍历 Float32Array | 100万点 ≈ 30ms |
| GPU 上传 | BufferGeometry 初始化 | 一次性，可接受 |
| 渲染 | draw call 点数 | 100万点 ≈ 5ms/帧 |
| 视锥裁剪 | CPU 逐点判断 | 100万点 ≈ 80ms |

### 5.2 优化方案

#### 方案一：八叉树空间索引 + 视锥裁剪（推荐）

```typescript
// 构建八叉树（加载时一次性）
class Octree {
  build(positions: Float32Array): void
  queryFrustum(frustum: THREE.Frustum): Uint32Array  // 可见点索引
}

// 每帧只渲染可见节点
const visibleIndices = octree.queryFrustum(camera.frustum)
geometry.setDrawRange(0, visibleIndices.length)
```

**效果：** 视野内 30% 点 → 渲染量减少 70%

#### 方案二：GPU 实例化 + Compute Shader（WebGPU）

```typescript
// 使用 WebGPU Compute Shader 在 GPU 端做视锥裁剪
// 避免 CPU-GPU 数据往返
const computePipeline = device.createComputePipeline({
  compute: { module: frustumCullShader, entryPoint: 'main' }
})
```

**效果：** 裁剪完全在 GPU 完成，CPU 零开销

#### 方案三：流式分块加载（Streaming LOD）

```
文件分块（每块 10万点）
    │
    ▼
Worker 并行解析多块
    │
    ▼
按距离相机远近动态加载/卸载块
    │  近处：全量点
    │  中距：50% 采样
    │  远处：10% 采样
    ▼
THREE.LOD 节点管理
```

```typescript
class StreamingPointCloud {
  private chunks: Map<string, PointChunk> = new Map()
  private readonly CHUNK_SIZE = 100_000

  loadChunk(chunkId: string, data: Float32Array): void
  unloadChunk(chunkId: string): void
  updateLOD(cameraPosition: THREE.Vector3): void
}
```

#### 方案四：WebAssembly 加速解析

```typescript
// 用 Rust/C++ 编写解析器，编译为 WASM
// 解析速度提升 5-10x
import init, { parse_kitti } from './parser.wasm'

const result = parse_kitti(buffer)  // 直接返回 Float32Array
```

#### 方案五：IndexedDB 缓存 + 增量更新

```typescript
class PointCloudCache {
  async store(key: string, data: ParsedPointCloud): Promise<void>
  async retrieve(key: string): Promise<ParsedPointCloud | null>
  // 文件 hash 作为 key，避免重复解析
}
```

#### 方案六：颜色映射 GPU 化

```glsl
// 在 vertex shader 中做颜色映射，消除 CPU 端 buildColors() 开销
attribute float intensity;
varying vec3 vColor;

void main() {
  // Jet colormap in shader
  float v = clamp(intensity, 0.0, 1.0);
  vColor = vec3(
    clamp(1.5 - abs(4.0 * v - 3.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0 * v - 2.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0 * v - 1.0), 0.0, 1.0)
  );
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = pointSize;
}
```

**效果：** 消除 CPU 端 `buildIntensityColors()` 的 30ms 开销，颜色切换瞬时完成

### 5.3 优化优先级建议

```
优先级 1（低成本高收益）
  ✅ 颜色映射移入 Vertex Shader
  ✅ 集成已有 FrustumCuller 到渲染循环

优先级 2（中等成本）
  ⬜ 八叉树空间索引
  ⬜ IndexedDB 解析缓存

优先级 3（高成本，大数据场景）
  ⬜ 流式分块加载
  ⬜ WebAssembly 解析器
  ⬜ WebGPU Compute Shader
```

---

## 六、文件结构速查

```
src/
├── core/
│   ├── KITTIParser.ts        # KITTI .bin 解析（float32 x4）
│   ├── PCDParser.ts          # PCD 解析（ASCII/binary/binary_compressed + LZF）
│   ├── DataLoader.ts         # 统一加载入口，支持 URL/File/进度/取消
│   ├── PointCloudRenderer.ts # Three.js 渲染，LOD，FPS 监控
│   ├── SceneController.ts    # 相机控制，预设视角，平滑动画
│   ├── LODManager.ts         # 降采样策略，均匀跳采索引
│   ├── FrustumCuller.ts      # 视锥体裁剪（CPU 端）
│   ├── AnnotationHistory.ts  # Command 模式 Undo/Redo
│   ├── LabelManager.ts       # 语义标签管理，导入/导出
│   ├── colorMapping.ts       # Jet colormap，强度/高度映射
│   └── tools/                # 标注工具（BoundingBox/Brush/RectSelect）
├── composables/
│   ├── usePointCloud.ts      # 加载状态管理，Worker 集成
│   ├── useScene.ts           # 渲染器生命周期，性能统计
│   ├── useAnnotation.ts      # 工具切换，快捷键，历史管理
│   └── useProject.ts         # 项目/帧管理
├── workers/
│   └── pointcloud.worker.ts  # 离线解析 Worker
├── stores/
│   └── ProjectStore.ts       # localStorage + ZIP 导出
└── types/
    └── index.ts              # 全局类型定义
```
