const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', magic: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/png', { extension: 'png', magic: bytes => bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]) }],
  ['image/webp', { extension: 'webp', magic: bytes => new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP' }],
  ['video/mp4', { extension: 'mp4', magic: bytes => bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' }],
  ['video/webm', { extension: 'webm', magic: bytes => bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 }],
])
const ASSET_TYPES = new Set(['logo', 'favicon', 'cover', 'banner', 'hero-media', 'hero-poster', 'ai-avatar', 'product', 'category', 'occasion', 'product-extra'])
const ROLE_ORDER = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 }
let certificateCache

class UploadFailure extends Error {
  constructor(code, status = 500) {
    super(code)
    this.code = code
    this.status = status
  }
}

export async function validateUploadFile(file) {
  if (!(file instanceof File)) return { ok: false, error: 'FILE_VALIDATION_FAILED' }
  if (file.size <= 0 || file.size > MAX_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' }
  const metadata = ALLOWED_TYPES.get(file.type)
  if (!metadata) return { ok: false, error: 'FILE_VALIDATION_FAILED' }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!metadata.magic(head)) return { ok: false, error: 'FILE_VALIDATION_FAILED' }
  return { ok: true, metadata }
}

function json(value, status = 200, origin = '') {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) } })
}

function corsHeaders(origin) {
  return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' } : {}
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean)
  return { origin, allowed: allowed.includes(origin) }
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(normalized)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)))
}

function readDerTlv(bytes, offset) {
  const tag = bytes[offset]
  let cursor = offset + 1
  if (tag === undefined || cursor >= bytes.length) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  let length = bytes[cursor++]
  if (length === undefined) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  if ((length & 0x80) !== 0) {
    const count = length & 0x7f
    if (count < 1 || count > 4 || cursor + count > bytes.length) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
    length = 0
    for (let index = 0; index < count; index += 1) length = length * 256 + bytes[cursor++]
  }
  const start = offset
  const contentStart = cursor
  const end = contentStart + length
  if (end > bytes.length) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  return { tag, start, contentStart, end, next: end }
}

function certificateSubjectPublicKeyInfo(der) {
  const certificate = readDerTlv(der, 0)
  const tbs = readDerTlv(der, certificate.contentStart)
  let cursor = tbs.contentStart
  const fields = []
  while (cursor < tbs.end) {
    const field = readDerTlv(der, cursor)
    fields.push(field)
    cursor = field.next
  }
  const versionOffset = fields[0]?.tag === 0xa0 ? 1 : 0
  const spki = fields[versionOffset + 5]
  if (!spki || spki.tag !== 0x30) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  return der.slice(spki.start, spki.next)
}

async function getCertificates() {
  if (certificateCache && certificateCache.expiresAt > Date.now()) return certificateCache.value
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
  if (!response.ok) throw new UploadFailure('NETWORK_ERROR', 503)
  const cacheControl = response.headers.get('cache-control') || ''
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300)
  certificateCache = { value: await response.json(), expiresAt: Date.now() + Math.min(maxAge, 3600) * 1000 }
  return certificateCache.value
}

async function verifyFirebaseToken(token, env) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  let header
  let payload
  try {
    header = decodeJson(parts[0])
    payload = decodeJson(parts[1])
  } catch {
    throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128 || Number(payload.exp) <= now || Number(payload.iat) > now + 60 || Number(payload.auth_time) > now + 60) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  const certificate = (await getCertificates())[header.kid]
  if (!certificate) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  let valid = false
  try {
    const binary = atob(certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, ''))
    const der = Uint8Array.from(binary, character => character.charCodeAt(0))
    const key = await crypto.subtle.importKey('spki', certificateSubjectPublicKeyInfo(der), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  } catch {
    throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  }
  if (!valid) throw new UploadFailure('AUTH_TOKEN_INVALID', 401)
  return payload
}

// Convert Google's PEM certificate to a WebCrypto JWK without a Node-only dependency.
async function certificateToJwk(pem) {
  const binary = atob(pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, ''))
  const der = Uint8Array.from(binary, character => character.charCodeAt(0))
  const key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify'])
  return crypto.subtle.exportKey('jwk', key)
}

async function membershipFor(uid, token, env) {
  const path = `${env.FIREBASE_DATABASE_URL.replace(/\/$/, '')}/shopMemberships/${encodeURIComponent(uid)}/floor-232bc.json?auth=${encodeURIComponent(token)}`
  const response = await fetch(path)
  if (!response.ok) throw new UploadFailure(response.status === 401 || response.status === 403 ? 'MEMBERSHIP_DENIED' : 'NETWORK_ERROR', 503)
  return response.json()
}

function authorizedMembership(membership) {
  if (!membership || membership.active !== true) return false
  const role = String(membership.role || '')
  if ((ROLE_ORDER[role] || -1) < ROLE_ORDER.MANAGER) return false
  if (role !== 'SUPER_ADMIN' && membership.permissions && membership.permissions.manageImages !== true && membership.permissions.images !== true) return false
  return true
}

function safeSegment(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : ''
}

function randomSegment() {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function uploadToGitHub(file, path, env) {
  if (!env.GITHUB_TOKEN) throw new UploadFailure('MISSING_GITHUB_SECRET', 503)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  const endpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const response = await fetch(endpoint, { method: 'PUT', headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'alasas-image-upload-worker' }, body: JSON.stringify({ message: `Upload store image ${path.split('/').pop()}`, content: btoa(binary), branch: env.GITHUB_BRANCH }) })
  if (!response.ok) {
    if (response.status === 401) throw new UploadFailure('GITHUB_AUTH_FAILED', 502)
    if (response.status === 403) throw new UploadFailure('GITHUB_PERMISSION_DENIED', 502)
    throw new UploadFailure('GITHUB_API_ERROR', 502)
  }
  let result
  try { result = await response.json() } catch { throw new UploadFailure('RESPONSE_PARSING_FAILED', 502) }
  if (typeof result.commit?.sha !== 'string' || typeof result.content?.path !== 'string' || Number(result.content?.size) !== bytes.length) throw new UploadFailure('GITHUB_API_ERROR', 502)
  return { commitSha: result.commit.sha, downloadUrl: typeof result.content.download_url === 'string' ? result.content.download_url : '' }
}

async function verifyPublicUrl(url) {
  if (!url) return false
  try {
    const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-15' } })
    return response.ok || response.status === 206
  } catch {
    return false
  }
}

export async function handleUpload(request, env) {
  const { origin, allowed } = originAllowed(request, env)
  if (!allowed) return json({ error: 'origin_not_allowed' }, 403, origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  const authorization = request.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthenticated' }, 401, origin)
  const token = authorization.slice(7).trim()
  try {
    const claims = await verifyFirebaseToken(token, env)
    const membership = await membershipFor(claims.sub, token, env)
    if (!authorizedMembership(membership)) return json({ error: 'MEMBERSHIP_DENIED' }, 403, origin)
    const form = await request.formData()
    const file = form.get('file')
    const assetType = safeSegment(form.get('assetType'))
    const recordId = safeSegment(form.get('recordId'))
    if (!(file instanceof File) || !ASSET_TYPES.has(assetType)) return json({ error: 'FILE_VALIDATION_FAILED' }, 400, origin)
    const validation = await validateUploadFile(file)
    if (!validation.ok) return json({ error: validation.error }, validation.error === 'FILE_TOO_LARGE' ? 413 : 415, origin)
    const metadata = validation.metadata
    const suffix = recordId ? `/${recordId}` : ''
    const path = `public/uploads/floor-232bc/${assetType}${suffix}/${Date.now()}-${randomSegment()}.${metadata.extension}`
    const github = await uploadToGitHub(file, path, env)
    const fallbackUrl = `${String(env.PUBLIC_BASE_URL).replace(/\/$/, '')}/${path.replace(/^public\//, '')}`
    const url = github.downloadUrl || fallbackUrl
    const publicUrlVerified = env.VERIFY_PUBLIC_URL === 'true' ? await verifyPublicUrl(url) : false
    if (env.VERIFY_PUBLIC_URL === 'true' && !publicUrlVerified) throw new UploadFailure('PUBLIC_URL_NOT_VERIFIED', 502)
    return json({ url, path, commitSha: github.commitSha, contentType: file.type, size: file.size, publicUrlVerified }, 201, origin)
  } catch (error) {
    const code = error instanceof UploadFailure ? error.code : 'NETWORK_ERROR'
    const status = error instanceof UploadFailure ? error.status : 502
    console.error('image_upload_failure', JSON.stringify({ code, status }))
    return json({ error: code }, status, origin)
  }
}

export default { async fetch(request, env) { return handleUpload(request, env) } }
