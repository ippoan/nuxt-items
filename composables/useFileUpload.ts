/**
 * 画像アップロード/ダウンロード Composable
 * REST API 経由で R2 に保存
 */
import { uploadFile, downloadFile } from '~/utils/api'

export function useFileUpload() {
  /**
   * 画像をクライアント側でリサイズしてJPEGに変換
   */
  async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width))
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('リサイズに失敗しました'))
            resolve(blob)
          },
          'image/jpeg',
          0.85,
        )
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('画像の読み込みに失敗しました'))
      }
      img.src = url
    })
  }

  /**
   * 画像をアップロードしてファイルUUIDを返す
   */
  async function uploadImage(file: File): Promise<string> {
    const resized = await resizeImage(file, 1200)
    const result = await uploadFile(file, resized)
    return result.id || ''
  }

  /**
   * ファイルUUIDからObject URLを取得
   */
  async function downloadImageAsObjectUrl(uuid: string): Promise<string | null> {
    try {
      const blob = await downloadFile(uuid)
      if (blob.size === 0) return null
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }

  return { uploadImage, downloadImageAsObjectUrl }
}
