import { getIdToken } from 'firebase/auth'
import { auth } from './firebase'

const endpoint = String(import.meta.env.VITE_IMAGE_UPLOAD_ENDPOINT || '').trim()

export type UploadAssetType = 'logo' | 'favicon' | 'cover' | 'banner' | 'product' | 'category' | 'occasion' | 'product-extra'
export type UploadResult = { url: string; path: string; commitSha?: string; contentType: string; size: number }

const errorMessages: Record<string, string> = {
  AUTH_TOKEN_INVALID: 'فشل التحقق من جلسة Firebase. سجّل الدخول مجدداً وحاول مرة أخرى.',
  MEMBERSHIP_DENIED: 'الحساب غير مخوّل برفع الصور.',
  FILE_VALIDATION_FAILED: 'نوع الصورة غير مدعوم أو محتوى الملف غير صالح.',
  FILE_TOO_LARGE: 'حجم الصورة كبير. الحد الأقصى ٨ ميغابايت.',
  MISSING_GITHUB_SECRET: 'خدمة رفع الصور غير مهيأة بأمان.',
  GITHUB_AUTH_FAILED: 'فشل توثيق خدمة GitHub.',
  GITHUB_PERMISSION_DENIED: 'لا تملك خدمة الرفع صلاحية الكتابة في GitHub.',
  GITHUB_API_ERROR: 'فشل حفظ الصورة في GitHub.',
  RESPONSE_PARSING_FAILED: 'تعذر قراءة استجابة خدمة الرفع.',
  NETWORK_ERROR: 'تعذر الاتصال بخدمة الرفع.',
}

export function imageUploadErrorMessage(code: string) { return errorMessages[code] || 'تعذر رفع الصورة. راجع سجل الخدمة لمزيد من التفاصيل.' }

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
  let response: Response
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  } catch {
    throw new Error(errorMessages.NETWORK_ERROR)
  }
  const payload = await response.json().catch(() => ({})) as Partial<UploadResult> & { error?: string }
  if (!response.ok || typeof payload.url !== 'string') throw new Error(imageUploadErrorMessage(payload.error || ''))
  return payload as UploadResult
}
