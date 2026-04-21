import type { ParsedPointCloud } from '@/types'
  private readonly DB_NAME = 'PointCloudCache'
  private readonly DB_VERSION = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('pointclouds')) {
          const store = db.createObjectStore('pointclouds', { keyPath: 'hash' })
          store.createIndex('hash', 'hash', { unique: true })
        }
      }
    })
  }

  async get(hash: string): Promise<ParsedPointCloud | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pointclouds'], 'readonly')
      const store = transaction.objectStore('pointclouds')
      const request = store.get(hash)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          // 转换 ArrayBuffer 回 Float32Array
          const data = result.data
          resolve({
            ...data,
            positions: new Float32Array(data.positions),
            intensities: new Float32Array(data.intensities),
          })
        } else {
          resolve(null)
        }
      }
    })
  }

  async set(hash: string, data: ParsedPointCloud): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pointclouds'], 'readwrite')
      const store = transaction.objectStore('pointclouds')

      // 存储时转换为普通对象（ArrayBuffer 会自动处理）
      const cacheData = {
        hash,
        data: {
          ...data,
          positions: data.positions.buffer.slice(0),
          intensities: data.intensities.buffer.slice(0),
        },
        timestamp: Date.now(),
      }

      const request = store.put(cacheData)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async computeHash(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pointclouds'], 'readwrite')
      const store = transaction.objectStore('pointclouds')
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}