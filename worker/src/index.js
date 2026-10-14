const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', magic: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/png', { extension: 'png', magic: bytes => bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]) }],
  ['image/webp', { extension: 'webp', magic: bytes => new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP' }],
])
const ASSET_TYPES = new Set(['logo', 'favicon', 'cover', 'banner', 'product', 'category', 'occasion', 'product-extra'])
const ROLE_ORDER = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 }
let certificateCache

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

async function getCertificates() {
  if (certificateCache && certificateCache.expiresAt > Date.now()) return certificateCache.value
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
  if (!response.ok) throw new Error('certificate_fetch_failed')
  const cacheControl = response.headers.get('cache-control') || ''
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300)
  certificateCache = { value: await response.json(), expiresAt: Date.now() + Math.min(maxAge, 3600) * 1000 }
  return certificateCache.value
}

async function verifyFirebaseToken(token, env) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid_token')
  const header = decodeJson(parts[0])
  const payload = decodeJson(parts[1])
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid_token')
  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128 || Number(payload.exp) <= now || Number(payload.iat) > now + 60 || Number(payload.auth_time) > now + 60) throw new Error('invalid_token')
  const certificate = (await getCertificates())[header.kid]
  if (!certificate) throw new Error('invalid_token')
  const key = await crypto.subtle.importKey('jwk', await certificateToJwk(certificate), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!valid) throw new Error('invalid_token')
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
  if (!response.ok) throw new Error('membership_lookup_failed')
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

async function uploadToGitHub(file, path, env) {
  if (!env.GITHUB_TOKEN) throw new Error('github_secret_missing')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  const endpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const response = await fetch(endpoint, { method: 'PUT', headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'alasas-image-upload-worker' }, body: JSON.stringify({ message: `Upload store image ${path.split('/').pop()}`, content: btoa(binary), branch: env.GITHUB_BRANCH }) })
  if (!response.ok) throw new Error('github_upload_failed')
  const result = await response.json()
  return typeof result.commit?.sha === 'string' ? result.commit.sha : ''
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
    if (!authorizedMembership(membership)) return json({ error: 'not_authorized' }, 403, origin)
    const form = await request.formData()
    const file = form.get('file')
    const assetType = safeSegment(form.get('assetType'))
    const recordId = safeSegment(form.get('recordId'))
    if (!(file instanceof File) || !ASSET_TYPES.has(assetType)) return json({ error: 'invalid_upload' }, 400, origin)
    if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'file_too_large' }, 413, origin)
    const metadata = ALLOWED_TYPES.get(file.type)
    if (!metadata) return json({ error: 'unsupported_image_type' }, 415, origin)
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (!metadata.magic(head)) return json({ error: 'invalid_image_content' }, 415, origin)
    const suffix = recordId ? `/${recordId}` : ''
    const path = `public/uploads/floor-232bc/${assetType}${suffix}/${Date.now()}-${randomSegment()}.${metadata.extension}`
    const commitSha = await uploadToGitHub(file, path, env)
    return json({ url: `${String(env.PUBLIC_BASE_URL).replace(/\/$/, '')}/${path.replace(/^public\//, '')}`, path, commitSha, contentType: file.type, size: file.size }, 201, origin)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const status = code === 'invalid_token' ? 401 : code === 'membership_lookup_failed' || code === 'github_secret_missing' ? 503 : 500
    return json({ error: status === 401 ? 'invalid_token' : 'upload_failed' }, status, origin)
  }
}

export default { async fetch(request, env) { return handleUpload(request, env) } }
