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

async function checkRate(uid, env) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    let result
    try { result = await env.RATE_LIMITER.limit({ key: `gifting:${uid}` }) } catch { fail('RATE_LIMITER_UNAVAILABLE', 503) }
    if (!result?.success) fail('RATE_LIMITED', 429)
    return
  }
  if (String(env.GIFTING_RATE_LIMITER_REQUIRED || '').toLowerCase() === 'true') fail('RATE_LIMITER_NOT_CONFIGURED', 503)
  const now = Date.now()
  const current = rateWindow.get(uid)
  if (!current || now - current.startedAt >= 60_000) { rateWindow.set(uid, { startedAt: now, count: 1 }); return }
  current.count += 1
  if (current.count > 60) fail('RATE_LIMITED', 429)
}

async function membershipFor(uid, adapter) {
  const current = await adapter.read(`shopMemberships/${uid}/${SHOP_ID}`)
  if (current && typeof current === 'object' && !Array.isArray(current) && current.active === true) return { ...current, shopId: current.shopId || SHOP_ID }
  const legacy = await adapter.read(`admins/${uid}`)
  return legacy && typeof legacy === 'object' ? { ...legacy, shopId: legacy.shopId || SHOP_ID } : legacy
}

function authorized(membership) {
  const role = String(membership?.role || '')
  return membership?.shopId === SHOP_ID && membership?.active === true && (ROLE_ORDER[role] ?? -1) >= ROLE_ORDER.MANAGER && (role === 'SUPER_ADMIN' || role === 'ADMIN' || (role === 'MANAGER' && membership?.permissions?.gifting !== false && membership?.permissions?.catalog !== false))
}

function pathParts(path, operation) {
  if (typeof path !== 'string' || path.includes('..') || path.includes('//')) fail('INVALID_PATH')
  const draftPrefix = `shops/${SHOP_ID}/admin/gifting`
  const publicPrefix = `shops/${SHOP_ID}/public/gifting`
  const inputPrefix = path.startsWith(`${draftPrefix}/`) || path === draftPrefix ? draftPrefix : publicPrefix
  if (!path.startsWith(`${inputPrefix}/`) && path !== inputPrefix) fail('INVALID_PATH')
  const parts = path.slice(inputPrefix.length).replace(/^\//, '').split('/').filter(Boolean)
  if (parts[0] === 'settings') {
    if (parts.length !== 1 || !['update'].includes(operation)) fail('INVALID_PATH')
    return { collection: 'settings', id: null, target: draftPrefix + '/settings', prefix: draftPrefix }
  }
  if (!COLLECTIONS.has(parts[0]) || (operation === 'create' && parts.length !== 1) || (operation !== 'create' && parts.length !== 2)) fail('INVALID_PATH')
  return { collection: parts[0], id: parts[1] || null, target: `${draftPrefix}/${parts[0]}${parts[1] ? `/${safeId(parts[1], 'id')}` : ''}`, prefix: draftPrefix }
}

export async function handleGiftingRequest(request, env, dependencies = {}) {
  const { origin, allowed } = allowedOrigin(request, env)
  if (!allowed) return json({ error: 'origin_not_allowed' }, 403, origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  try {
    const identity = await (dependencies.verifyToken || verifyFirebaseIdToken)(request, env)
    if (identity.claims?.email_verified === false) fail('EMAIL_NOT_VERIFIED', 403)
    if (identity.claims?.firebase?.sign_in_provider && identity.claims.firebase.sign_in_provider !== 'google.com') fail('GOOGLE_SIGN_IN_REQUIRED', 403)
    if (!env.FIREBASE_DATABASE_URL) fail('RTDB_NOT_CONFIGURED', 503)
    const adapter = dependencies.adapter || createRtdbAdapter({ env })
    await checkRate(identity.uid, env)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) fail('BODY_TOO_LARGE', 413)
    let body
    try { body = JSON.parse(rawBody) } catch { fail('INVALID_JSON') }
    const operation = body?.operation
    if (!['create', 'update', 'publish', 'hide', 'archive'].includes(operation)) fail('INVALID_OPERATION')
    const parsed = pathParts(body?.path, operation)
    const membership = await membershipFor(identity.uid, adapter)
    if (!authorized(membership)) fail('MEMBERSHIP_DENIED', 403)
    const requested = operation === 'archive' ? { enabled: false, status: 'ARCHIVED' } : operation === 'publish' ? { enabled: true, status: 'PUBLISHED' } : operation === 'hide' ? { enabled: false, status: 'HIDDEN' } : body.value
    let value
    if (operation === 'create') value = sanitizeValue(parsed.collection, requested, operation)
    else {
      const existing = await adapter.read(parsed.target)
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) fail('RECORD_NOT_FOUND', 404)
      value = sanitizeValue(parsed.collection, { ...existing, ...requested }, 'update')
    }
    if (operation === 'create') parsed.id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    const target = operation === 'create' ? `${parsed.target}/${parsed.id}` : parsed.target
    let readback
    if (['publish', 'hide', 'archive'].includes(operation)) {
      if (parsed.prefix !== `shops/${SHOP_ID}/admin/gifting`) fail('INVALID_PATH')
      const publicTarget = target.replace(`/admin/gifting/`, `/public/gifting/`)
      const publicValue = operation === 'publish' ? { ...value, enabled: true, status: 'PUBLISHED' } : null
      const draftValue = operation === 'publish' ? publicValue : { ...value, enabled: false, status: operation === 'archive' ? 'ARCHIVED' : 'HIDDEN' }
      if (typeof adapter.writeMany !== 'function') fail('ATOMIC_WRITE_UNAVAILABLE', 503)
      await adapter.writeMany({ [target]: draftValue, [publicTarget]: publicValue })
      readback = await adapter.read(publicTarget)
      if (operation === 'publish' && (!readback || readback.status !== 'PUBLISHED' || readback.enabled !== true)) fail('READBACK_FAILED', 502)
      if (['hide', 'archive'].includes(operation) && readback !== null) fail('READBACK_FAILED', 502)
    } else {
      await adapter.write(target, value)
      readback = await adapter.read(target)
    }
    if (!['hide', 'archive'].includes(operation) && (!readback || typeof readback !== 'object')) fail('READBACK_FAILED', 502)
    const auditId = crypto.randomUUID().replace(/-/g, '')
    await adapter.write(`shops/${SHOP_ID}/private/activityLogs/${auditId}`, { action: `GIFTING_${operation.toUpperCase()}`, actorUid: identity.uid, role: membership.role, path: target, createdAt: Date.now() })
    return json({ ok: true, operation, path: target, key: parsed.id, readback }, 200, origin)
  } catch (error) {
    const code = error?.message || 'GIFTING_BACKEND_ERROR'
    const status = Number(error?.status) || (code === 'UNAUTHENTICATED' || code === 'AUTH_TOKEN_INVALID' ? 401 : ['SERVICE_ACCOUNT_NOT_CONFIGURED', 'TOKEN_EXCHANGE_FAILED', 'TOKEN_RESPONSE_INVALID', 'AUTH_KEYS_UNAVAILABLE', 'RTDB_NOT_CONFIGURED', 'RTDB_TIMEOUT', 'RTDB_UNAVAILABLE', 'RATE_LIMITER_UNAVAILABLE'].includes(code) ? 503 : 400)
    return json({ error: code }, status, origin)
  }
}

