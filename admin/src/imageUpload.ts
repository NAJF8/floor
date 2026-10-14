import { getIdToken } from 'firebase/auth'
import { auth } from './firebase'

const endpoint = String(import.meta.env.VITE_IMAGE_UPLOAD_ENDPOINT || '').trim()

export type UploadAssetType = 'logo' | 'favicon' | 'cover' | 'banner' | 'product' | 'category' | 'occasion' | 'product-extra'
export type UploadResult = { url: string; path: string; commitSha?: string; contentType: string; size: number }

export function imageUploadConfigured() { return Boolean(endpoint) }

export async function uploadImage(file: File, assetType: UploadAssetType, recordId?: string): Promise<UploadResult> {
  if (!endpoint) throw new Error('رفع الصور غير مهيأ بعد: يلزم نشر Worker الآمن.')
  const user = auth.currentUser
  if (!user) throw new Error('يجب تسجيل الدخول قبل رفع الصورة.')
  const token = await getIdToken(user, true)
  const form = new FormData()
  form.append('file', file)
  form.append('assetType', assetType)
  if (recordId) form.append('recordId', recordId)
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const payload = await response.json().catch(() => ({})) as Partial<UploadResult> & { error?: string }
  if (!response.ok || typeof payload.url !== 'string') throw new Error(payload.error || 'تعذر رفع الصورة.')
  return payload as UploadResult
}
