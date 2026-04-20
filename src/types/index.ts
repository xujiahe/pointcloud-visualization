/**
 * 解析后的点云数据
 *
 * 激光雷达扫描一帧场景后，返回数万到数百万个空间点。
 * 每个点有三维坐标（positions）和激光反射强度（intensities）。
 *
 * 使用 Float32Array 而非普通数组的原因：
 *   1. 内存紧凑：每个数值固定 4 字节，无 JS 对象开销
 *   2. 可直接传给 Three.js BufferGeometry，无需转换即可上传 GPU
 *   3. 支持 Transferable Objects，Worker 间零拷贝传输
 */
export interface ParsedPointCloud {
  /**
   * 所有点的三维坐标，三个值为一组：[x0,y0,z0, x1,y1,z1, ...]
   *   x：水平方向（左右，单位：米）
   *   y：纵深方向（前后，单位：米）
   *   z：垂直方向（高低，单位：米）
   * 数组长度 = count * 3
   */
  positions: Float32Array

  /**
   * 每个点的激光反射强度，归一化到 [0, 1]
   *   高强度（接近 1）：金属、路牌、白色标线等高反射材质
   *   低强度（接近 0）：草地、泥土、玻璃等低反射材质
   * 用途：Jet colormap 颜色映射（蓝→绿→红），或识别车道线
   * 数组长度 = count
   */
  intensities: Float32Array

  /** 点的总数量 */
  count: number
}

/**
 * 3D 包围盒（用于目标检测标注）
 *
 * 在自动驾驶标注中，用于框出车辆、行人、骑行者等目标。
 * 由中心点、尺寸、旋转角唯一确定一个长方体。
 */
export interface BoundingBox3D {
  /** 唯一标识符（UUID） */
  id: string

  /**
   * 包围盒中心点坐标 [x, y, z]，单位：米
   * 通常 z 为目标高度的一半（底面到中心）
   */
  center: [number, number, number]

  /**
   * 包围盒尺寸 [length, width, height]，单位：米
   *   length：沿车辆行驶方向的长度
   *   width：垂直行驶方向的宽度
   *   height：垂直方向的高度
   */
  size: [number, number, number]

  /**
   * 绕 Z 轴的旋转角（yaw），单位：弧度
   * 表示目标朝向，0 = 正前方，π/2 = 朝左
   */
  rotation: number

  /** 语义类别名称，如 'Car'、'Pedestrian'、'Cyclist' */
  label: string

  /** 包围盒线框颜色，十六进制格式 '#RRGGBB' */
  color: string
}

/**
 * 语义分割类别
 *
 * 用于点级别的语义标注，为每个点分配一个类别（如道路、建筑、植被）。
 * 默认包含 7 个类别，可自定义扩展。
 */
export interface SemanticCategory {
  /**
   * 类别 ID（uint32）
   * 存储在 LabelManager.pointLabels 中，导出为 .label 二进制文件
   * 0 = Unknown（默认值）
   */
  id: number

  /** 类别名称，如 'Car'、'Road'、'Vegetation' */
  name: string

  /** 该类别在点云中的显示颜色，十六进制格式 '#RRGGBB' */
  color: string
}

/**
 * 帧记录
 *
 * 一帧对应激光雷达在某一时刻采集的完整点云快照。
 * 一个标注项目包含多帧，每帧独立存储标注数据。
 */
export interface FrameRecord {
  /** 唯一标识符（UUID） */
  id: string

  /** 帧名称，通常为文件名（如 '000001'） */
  name: string

  /** 点云文件的远程 URL（可选，用于从网络加载） */
  url?: string

  /**
   * 标注状态
   *   unlabeled：未开始标注
   *   in-progress：标注进行中
   *   completed：标注已完成并审核
   */
  status: 'unlabeled' | 'in-progress' | 'completed'

  /** 该帧的 3D 包围盒标注列表 */
  boundingBoxes: BoundingBox3D[]

  /**
   * 语义分割标签（稀疏格式）
   * 格式：[点索引0, 类别ID0, 点索引1, 类别ID1, ...]
   * 仅存储非 Unknown（id≠0）的点，节省存储空间
   */
  semanticLabels?: number[]
}

/**
 * 标注项目数据（持久化到 localStorage）
 *
 * 一个项目管理多帧点云的标注任务，
 * 序列化后存储在 localStorage，key 为 'pointcloud-project-{id}'
 */
export interface ProjectData {
  /** 唯一标识符（UUID） */
  id: string

  /** 项目名称 */
  name: string

  /** 项目包含的所有帧 */
  frames: FrameRecord[]

  /** 语义类别配置（可自定义颜色和名称） */
  categories: SemanticCategory[]

  /** 当前正在编辑的帧 ID，null 表示未选中 */
  currentFrameId: string | null

  /** 创建时间戳（毫秒） */
  createdAt: number

  /** 最后修改时间戳（毫秒） */
  updatedAt: number
}

/**
 * Web Worker 解析请求
 *
 * 主线程将原始文件 buffer 通过 Transferable Objects 传给 Worker，
 * Worker 在后台线程解析，不阻塞 UI。
 */
export interface WorkerRequest {
  type: 'parse'

  /**
   * 文件格式
   *   kitti-bin：KITTI 数据集 .bin 格式（4×float32：x,y,z,intensity）
   *   pcd：PCL 点云库格式（支持 ascii/binary/binary_compressed）
   *   las：LAS 激光雷达格式（LAS 1.0-1.4）
   *   laz：LAZ 压缩格式（LAS + LASzip 压缩）
   */
  format: 'kitti-bin' | 'pcd' | 'las' | 'laz'

  /**
   * 原始文件二进制数据
   * 通过 Transferable 传输，所有权转移给 Worker，主线程不再持有
   */
  buffer: ArrayBuffer
}

/**
 * Web Worker 解析响应
 *
 * 解析成功时返回 positions/intensities/count，
 * 解析失败时返回 error 字符串。
 * 两种情况共用一个类型，用 type 字段区分。
 */
export interface WorkerResponse {
  /** 'parsed' = 成功，'error' = 失败 */
  type: 'parsed' | 'error'

  /**
   * 解析成功时：所有点的坐标数组 [x0,y0,z0, x1,y1,z1, ...]
   * 通过 Transferable 传回主线程，零拷贝
   */
  positions?: Float32Array

  /**
   * 解析成功时：所有点的反射强度数组 [i0, i1, ...]
   * 通过 Transferable 传回主线程，零拷贝
   */
  intensities?: Float32Array

  /** 解析成功时：点的总数量 */
  count?: number

  /** 解析失败时：错误信息 */
  error?: string
}

/**
 * 文件加载选项
 */
export interface LoadOptions {
  /**
   * 加载进度回调
   * @param loaded 已加载字节数
   * @param total 总字节数（0 表示未知）
   */
  onProgress?: (loaded: number, total: number) => void

  /** 用于取消加载的信号（配合 AbortController 使用） */
  signal?: AbortSignal
}

/**
 * 点云颜色渲染模式
 *   intensity：按激光反射强度着色（Jet colormap，蓝→绿→红）
 *   height：按 Z 轴高度着色（低处蓝色，高处红色）
 *   semantic：按语义标注类别着色（每类别独立颜色）
 */
export type ColorMode = 'intensity' | 'height' | 'semantic'

/**
 * 标注工具类型
 *   select：选择模式，可旋转/平移场景，点击选中包围盒
 *   boundingbox：3D 包围盒绘制工具，拖拽创建
 *   brush：语义笔刷，在场景中刷选点并分配类别
 *   rectselect：矩形框选，在屏幕上框选投影范围内的点
 */
export type ToolType = 'select' | 'boundingbox' | 'brush' | 'rectselect'
