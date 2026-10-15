import { verifyFirebaseIdToken } from './firebase-auth.js'
import { createRtdbAdapter } from './rtdb-adapter.js'

const SHOP_ID = 'floor-232bc'
const MAX_BODY_BYTES = 32 * 1024
const ROLE_ORDER = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 }
const COLLECTIONS = new Set(['addons', 'cards', 'occasions', 'flowerTypes', 'flowerColors', 'stemCounts', 'wrappings', 'wrappingColors', 'ribbons'])
const OPTION_FIELDS = new Set(['label', 'labelEn', 'price', 'image', 'order', 'enabled', 'status'])
const ADDON_FIELDS = new Set(['name', 'nameEn', 'category', 'price', 'stock', 'image', 'order', 'enabled', 'bouquetCompatible', 'status'])
const CARD_FIELDS = new Set(['text', 'occasion', 'price', 'order', 'enabled', 'status'])
const SETTINGS_FIELDS = new Set(['maxCardMessageLength', 'preparationHours'])
const rateWindow = new Map()

function json(value, status, origin, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...extra } })
}

function corsHeaders(origin) {
  return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' } : {}
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  return { origin, allowed: allowed.includes(origin) }
}

function fail(code, status = 400) { const error = new Error(code); error.status = status; throw error }

function safeId(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) fail(`INVALID_${field.toUpperCase()}`)
  return value
}

function numberField(value, field, max = 1_000_000_000) {
  if (!Number.isInteger(value) || value < 0 || value > max) fail(`INVALID_${field.toUpperCase()}`)
}

function stringField(value, field, max) {
  if (typeof value !== 'string' || value.length > max) fail(`INVALID_${field.toUpperCase()}`)
}

function sanitizeValue(collection, value, operation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_VALUE')
  const allowed = collection === 'addons' ? ADDON_FIELDS : collection === 'cards' ? CARD_FIELDS : collection === 'settings' ? SETTINGS_FIELDS : OPTION_FIELDS
  const clean = {}
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue
    if (['price', 'stock', 'order', 'maxCardMessageLength', 'preparationHours'].includes(key)) { numberField(item, key, key === 'price' ? 1_000_000_000 : 1_000_000); clean[key] = item }
    else if (['enabled', 'bouquetCompatible'].includes(key)) { if (typeof item !== 'boolean') fail(`INVALID_${key.toUpperCase()}`); clean[key] = item }
    else { stringField(item, key, key === 'image' ? 1000 : key === 'text' ? 500 : 160); if (key === 'status' && !['PUBLISHED', 'HIDDEN', 'DRAFT', 'ARCHIVED'].includes(item)) fail('INVALID_STATUS'); clean[key] = item.trim() }
  }
  if (operation === 'create') {
    const required = collection === 'addons' ? 'name' : collection === 'cards' ? 'text' : collection === 'settings' ? null : 'label'
    if (required && !clean[required]) fail(`MISSING_${required.toUpperCase()}`)
  }
  if (!Object.keys(clean).length) fail('EMPTY_VALUE')
  return clean
}

function checkRate(uid) {
  const now = Date.now()
  const current = rateWindow.get(uid)
  if (!current || now - current.startedAt >= 60_000) { rateWindow.set(uid, { startedAt: now, count: 1 }); return }
  current.count += 1
  if (current.count > 60) fail('RATE_LIMITED', 429)
}

async function membershipFor(uid, adapter) {
  return adapter.read(`shopMemberships/${uid}/${SHOP_ID}`)
}

function authorized(membership) {
  const role = String(membership?.role || '')
  return membership?.active === true && (ROLE_ORDER[role] ?? -1) >= ROLE_ORDER.MANAGER && (role === 'SUPER_ADMIN' || membership?.permissions?.catalog !== false)
}

function pathParts(path, operation) {
  if (typeof path !== 'string' || path.includes('..') || path.includes('//')) fail('INVALID_PATH')
  const prefix = `shops/${SHOP_ID}/public/gifting`
  if (!path.startsWith(`${prefix}/`) && path !== prefix) fail('INVALID_PATH')
  const parts = path.slice(prefix.length).replace(/^\//, '').split('/').filter(Boolean)
  if (parts[0] === 'settings') {
    if (parts.length !== 1 || !['update'].includes(operation)) fail('INVALID_PATH')
    return { collection: 'settings', id: null, target: prefix + '/settings' }
  }
  if (!COLLECTIONS.has(parts[0]) || (operation === 'create' && parts.length !== 1) || (operation !== 'create' && parts.length !== 2)) fail('INVALID_PATH')
  return { collection: parts[0], id: parts[1] || null, target: `${prefix}/${parts[0]}${parts[1] ? `/${safeId(parts[1], 'id')}` : ''}` }
}

export async function handleGiftingRequest(request, env, dependencies = {}) {
  const { origin, allowed } = allowedOrigin(request, env)
  if (!allowed) return json({ error: 'origin_not_allowed' }, 403, origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  const length = Number(request.headers.get('content-length') || 0)
  if (length > MAX_BODY_BYTES) return json({ error: 'body_too_large' }, 413, origin)
  try {
    const identity = await (dependencies.verifyToken || verifyFirebaseIdToken)(request, env)
    if (identity.claims?.email_verified === false) fail('EMAIL_NOT_VERIFIED', 403)
    if (identity.claims?.firebase?.sign_in_provider && identity.claims.firebase.sign_in_provider !== 'google.com') fail('GOOGLE_SIGN_IN_REQUIRED', 403)
    if (!env.FIREBASE_DATABASE_URL) fail('RTDB_NOT_CONFIGURED', 503)
    const adapter = dependencies.adapter || createRtdbAdapter({ env })
    checkRate(identity.uid)
    const body = await request.json()
    const operation = body?.operation
    if (!['create', 'update', 'archive'].includes(operation)) fail('INVALID_OPERATION')
    const parsed = pathParts(body?.path, operation)
    const membership = await membershipFor(identity.uid, adapter)
    if (!authorized(membership)) fail('MEMBERSHIP_DENIED', 403)
    const value = operation === 'archive' ? { enabled: false, status: 'ARCHIVED' } : sanitizeValue(parsed.collection, body.value, operation)
    if (operation === 'create') parsed.id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    const target = operation === 'create' ? `${parsed.target}/${parsed.id}` : parsed.target
    await adapter.write(target, value)
    const readback = await adapter.read(target)
    if (!readback || typeof readback !== 'object') fail('READBACK_FAILED', 502)
    const auditId = crypto.randomUUID().replace(/-/g, '')
    await adapter.write(`shops/${SHOP_ID}/private/activityLogs/${auditId}`, { action: `GIFTING_${operation.toUpperCase()}`, actorUid: identity.uid, role: membership.role, path: target, createdAt: Date.now() })
    return json({ ok: true, operation, path: target, key: parsed.id, readback }, 200, origin)
  } catch (error) {
    const code = error?.message || 'GIFTING_BACKEND_ERROR'
    return json({ error: code }, Number(error?.status) || (code === 'UNAUTHENTICATED' || code === 'AUTH_TOKEN_INVALID' ? 401 : 400), origin)
  }
}

