import { DataLoader, UnsupportedFormatError } from '../Parsers/DataLoader'

describe('DataLoader', () => {
  let loader: DataLoader

  beforeEach(() => {
    loader = new DataLoader()
  })

  describe('detectFormat', () => {
    it('.bin 文件返回 kitti-bin', () => {
      expect(loader.detectFormat('scan.bin')).toBe('kitti-bin')
      expect(loader.detectFormat('path/to/file.BIN')).toBe('kitti-bin')
    })

    it('.pcd 文件返回 pcd', () => {
      expect(loader.detectFormat('cloud.pcd')).toBe('pcd')
      expect(loader.detectFormat('path/to/file.PCD')).toBe('pcd')
    })

    it('.xyz 文件返回 unsupported', () => {
      expect(loader.detectFormat('points.xyz')).toBe('unsupported')
      expect(loader.detectFormat('data.txt')).toBe('unsupported')
      expect(loader.detectFormat('noextension')).toBe('unsupported')
    })
  })

  describe('loadFromURL', () => {
    it('不支持格式时抛出 UnsupportedFormatError，错误消息包含 .bin 和 .pcd', async () => {
      await expect(loader.loadFromURL('http://example.com/data.xyz'))
        .rejects.toThrow(UnsupportedFormatError)

      try {
        await loader.loadFromURL('http://example.com/data.xyz')
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedFormatError)
        expect((err as Error).message).toContain('.bin')
        expect((err as Error).message).toContain('.pcd')
      }
    })
  })
})
