import { verifyFirebaseIdToken } from './firebase-auth.js'
import { createRtdbAdapter } from './rtdb-adapter.js'
import { createD1OrderRepository } from './d1-order-engine.js'
import { createD1AdminApi } from './d1-admin-api.js'
import { allowedOrigin, enforceRateLimit, readJsonBody } from './order-security.js'

function response(value, status = 200, origin = '') {
  const headers = { 'content-type': 'application/json; charset=utf-8' }
  if (origin) { headers['access-control-allow-origin'] = origin; headers['access-control-allow-credentials'] = 'true'; headers['access-control-allow-methods'] = 'POST, GET, OPTIONS'; headers['access-control-allow-headers'] = 'Authorization, Content-Type' }
  return new Response(JSON.stringify(value), { status, headers })
}
async function authenticated(request, env) { try { return await verifyFirebaseIdToken(request, env) } catch { throw new Error('UNAUTHENTICATED') } }
async function adminClaims(request, env, rtdb) {
  const user = await authenticated(request, env)
  const membership = await rtdb.read(`shopMemberships/${encodeURIComponent(user.uid)}/${env.FIREBASE_SHOP_ID || 'floor-232bc'}`)
  if (!membership || membership.active !== true || !membership.role) throw new Error('ADMIN_PERMISSION_DENIED')
  return { uid: user.uid, role: membership.role, permissions: membership.permissions || {} }
}

export async function handleOrderRequest(request, env) {
  const { origin, allowed } = allowedOrigin(request, env)
  const send = (value, status = 200) => response(value, status, origin)
  if (!allowed) return send({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' } })
  if (!env.DB) return send({ error: 'D1_NOT_CONFIGURED' }, 503)
  try {
    const url = new URL(request.url)
    if (url.pathname === '/orders' && request.method === 'POST') {
      if (String(env.ORDERS_ENABLED || 'false').toLowerCase() !== 'true') return send({ error: 'ORDER_INGEST_DISABLED' }, 503)
      const repository = createD1OrderRepository(env.DB)
      const user = await authenticated(request, env)
      await enforceRateLimit(request, env, user.uid)
      return send(await repository.createOrder({ uid: user.uid, input: await readJsonBody(request) }), 201)
    }
    if (url.pathname.startsWith('/admin/orders')) {
      const rtdb = createRtdbAdapter({ env })
      const claims = await adminClaims(request, env, rtdb)
      const admin = createD1AdminApi(env.DB)
      const orderId = url.pathname.split('/')[3]
      if (request.method === 'GET' && orderId) return send(await admin.getOrder({ claims, orderId }))
      if (request.method === 'GET') return send(await admin.listOrders({ claims, status: url.searchParams.get('status') || '', query: url.searchParams.get('q') || '', limit: url.searchParams.get('limit') || 50 }))
      await enforceRateLimit(request, env, claims.uid)
      const body = await readJsonBody(request)
      if (body.action === 'cancel') return send(await admin.cancelOrder({ claims, orderId }))
      return send(await admin.updateStatus({ claims, orderId, nextStatus: body.status }))
    }
    return send({ error: 'NOT_FOUND' }, 404)
  } catch (error) {
    const known = ['UNAUTHENTICATED', 'ADMIN_PERMISSION_DENIED', 'DUPLICATE_ORDER', 'DEMO_ORDER_REJECTED', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'GIFTING_OPTION_UNAVAILABLE', 'GIFTING_OPTION_OUT_OF_STOCK', 'INVALID_DELIVERY', 'INVALID_PAYMENT', 'CATALOG_OUT_OF_SYNC', 'REQUEST_BODY_TOO_LARGE', 'RATE_LIMITED', 'RATE_LIMITER_NOT_CONFIGURED', 'ORDER_INGEST_DISABLED']
    const code = known.includes(error?.message) ? error.message : 'INTERNAL_ERROR'
    const status = code === 'UNAUTHENTICATED' ? 401 : code === 'ADMIN_PERMISSION_DENIED' ? 403 : code === 'DUPLICATE_ORDER' ? 409 : code === 'RATE_LIMITED' ? 429 : code === 'RATE_LIMITER_NOT_CONFIGURED' ? 503 : code === 'ORDER_INGEST_DISABLED' ? 503 : code === 'INTERNAL_ERROR' ? 503 : code === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400
    return send({ error: code }, status)
  }
}

export default { fetch: handleOrderRequest }
