import { getIdToken } from 'firebase/auth'
import { auth } from './firebase'

const endpoint = String(import.meta.env.VITE_IMAGE_UPLOAD_ENDPOINT || '').trim()

export type UploadAssetType = 'logo' | 'favicon' | 'cover' | 'banner' | 'hero-media' | 'hero-poster' | 'ai-avatar' | 'product' | 'category' | 'occasion' | 'product-extra'
export type UploadResult = { url: string; path: string; commitSha: string; contentType: string; size: number; publicUrlVerified: boolean }
export type PreparedUpload = { file: File; previewUrl: string; originalName: string; originalType: string; originalSize: number; converted: boolean }

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/svg+xml'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'svg'])
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 4096

const errorMessages: Record<string, string> = {
  AUTH_TOKEN_INVALID: 'فشل التحقق من جلسة Firebase. سجّل الدخول مجدداً وحاول مرة أخرى.',
  MEMBERSHIP_DENIED: 'الحساب غير مخوّل برفع الصور.',
  FILE_VALIDATION_FAILED: 'نوع الصورة غير مدعوم أو محتوى الملف غير صالح.',
  FILE_TOO_LARGE: 'حجم الملف كبير. الحد المحافظ للصور والفيديو عبر GitHub هو ٨ ميغابايت.',
  PUBLIC_URL_NOT_VERIFIED: 'تم رفض الرفع لأن الرابط العام لم يُتحقق منه بعد.',
  MISSING_GITHUB_SECRET: 'خدمة رفع الصور غير مهيأة بأمان.',
  GITHUB_AUTH_FAILED: 'فشل توثيق خدمة GitHub.',
  GITHUB_PERMISSION_DENIED: 'لا تملك خدمة الرفع صلاحية الكتابة في GitHub.',
  GITHUB_API_ERROR: 'فشل حفظ الصورة في GitHub.',
  RESPONSE_PARSING_FAILED: 'تعذر قراءة استجابة خدمة الرفع.',
  NETWORK_ERROR: 'تعذر الاتصال بخدمة الرفع.',
}

export function imageUploadErrorMessage(code: string) { return errorMessages[code] || 'تعذر رفع الصورة. راجع سجل الخدمة لمزيد من التفاصيل.' }

export function imageUploadConfigured() { return Boolean(endpoint) }

export function isAllowedPublicAssetUrl(value: string) {
  try {
    const url = new URL(value)
    const allowedPath = url.pathname.includes('/public/uploads/floor-232bc/') || url.pathname.includes('/uploads/floor-232bc/') || url.pathname.includes('/floor/uploads/floor-232bc/')
    return url.protocol === 'https:' && allowedPath && (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'najf8.github.io' || url.hostname === 'flowers.alasas.tech')
  } catch { return false }
}

function extensionOf(name: string) { return name.toLowerCase().split('.').pop() || '' }
function svgIsSafe(text: string) { return !/<script|on[a-z]+\s*=|javascript:|data:text\/html|<foreignObject/i.test(text) && !/<(?:use|image)[^>]+(?:href|xlink:href)=['"]https?:/i.test(text) }

async function decodeImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > MAX_IMAGE_DIMENSION || image.naturalHeight > MAX_IMAGE_DIMENSION) throw new Error('أبعاد الصورة يجب ألا تتجاوز 4096×4096 بكسل.')
    return image
  } finally { URL.revokeObjectURL(url) }
}

export async function prepareImageForUpload(file: File): Promise<PreparedUpload> {
  const extension = extensionOf(file.name)
  if (!IMAGE_MIME_TYPES.has(file.type) && !IMAGE_EXTENSIONS.has(extension)) throw new Error('الصيغة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF أو AVIF أو BMP أو TIFF أو HEIC أو SVG.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('حجم الصورة يتجاوز 8MB.')
  if (file.type === 'image/svg+xml' || extension === 'svg') {
    const text = await file.text()
    if (!svgIsSafe(text)) throw new Error('تم رفض SVG لأنه يحتوي محتوى نشطاً أو رابطاً خارجياً.')
  }
  try {
    const image = await decodeImage(file)
    const nativelyAccepted = file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp'
    if (nativelyAccepted) return { file, previewUrl: URL.createObjectURL(file), originalName: file.name, originalType: file.type, originalSize: file.size, converted: false }
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('تعذر تجهيز الصورة للتحويل الآمن.')
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('تعذر تحويل الصورة إلى PNG آمن.')
    const converted = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' })
    return { file: converted, previewUrl: URL.createObjectURL(converted), originalName: file.name, originalType: file.type || extension, originalSize: file.size, converted: true }
  } catch (error) {
    if (error instanceof Error && error.message.includes('4096')) throw error
    throw new Error('تعذر قراءة هذه الصيغة في المتصفح لتحويلها إلى PNG. اختر PNG أو JPG أو WebP.')
  }
}

export async function uploadAsset(file: File, assetType: UploadAssetType, recordId?: string, onProgress?: (percent: number) => void): Promise<UploadResult> {
  if (!endpoint) throw new Error('رفع الصور غير مهيأ بعد: يلزم نشر Worker الآمن.')
  const user = auth.currentUser
  if (!user) throw new Error('يجب تسجيل الدخول قبل رفع الصورة.')
  const token = await getIdToken(user, true)
  const form = new FormData()
  form.append('file', file)
  form.append('assetType', assetType)
  if (recordId) form.append('recordId', recordId)
  onProgress?.(0)
  let response: Response
  try {
    response = await new Promise<Response>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', endpoint)
      request.setRequestHeader('Authorization', `Bearer ${token}`)
      request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)) }
      request.onerror = () => reject(new Error(errorMessages.NETWORK_ERROR))
      request.onload = () => resolve(new Response(request.responseText, { status: request.status, headers: { 'content-type': request.getResponseHeader('content-type') || 'application/json' } }))
      request.send(form)
    })
  } catch {
    throw new Error(errorMessages.NETWORK_ERROR)
  }
  const payload = await response.json().catch(() => ({})) as Partial<UploadResult> & { error?: string }
  if (!response.ok || typeof payload.url !== 'string' || typeof payload.path !== 'string' || typeof payload.commitSha !== 'string') throw new Error(imageUploadErrorMessage(payload.error || ''))
  if (payload.publicUrlVerified !== true || !isAllowedPublicAssetUrl(payload.url)) throw new Error(errorMessages.PUBLIC_URL_NOT_VERIFIED)
  onProgress?.(100)
  return payload as UploadResult
}

export const uploadImage = uploadAsset
