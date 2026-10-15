import { calculateOrder, normalizeOrderInput, SHOP_ID } from '../../functions/src/order.js'

export const DEMO_MARKER = 'ALASAS_DEMO_V1'

class OrderBackendError extends Error {
  constructor(code, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function assertAuthenticated(claims) {
  if (!claims || typeof claims.uid !== 'string' || !claims.uid) throw new OrderBackendError('UNAUTHENTICATED', 401)
  return claims.uid
}

function publicSnapshot(snapshot) {
  return {
    products: snapshot?.products || {},
    delivery: snapshot?.delivery || {},
    paymentMethods: snapshot?.paymentMethods || {},
    discounts: snapshot?.discounts || {},
    settings: snapshot?.settings || {},
  }
}

function safeOrderRecord(order, uid, orderId, now) {
  return {
    id: orderId,
    uid,
    customerName: order.customerName,
    phone: order.phone,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    province: order.province,
    district: order.district,
    address: order.address,
    deliveryAt: order.deliveryAt,
    giftMessage: order.giftMessage,
    couponCode: order.couponCode,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount,
    discountDetail: order.discountDetail || null,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    transferReference: order.transferReference,
    paymentStatus: order.paymentMethod.type === 'CASH' ? 'UNPAID' : 'PENDING_REVIEW',
    orderStatus: 'NEW',
    createdAt: now,
    updatedAt: now,
  }
}

function validationError(code) {
  const map = {
    PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
    INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
    DELIVERY_AREA_UNCONFIGURED: 'INVALID_DELIVERY',
    PAYMENT_METHOD_UNAVAILABLE: 'INVALID_PAYMENT',
    DISCOUNT_UNAVAILABLE: 'INVALID_DISCOUNT',
  }
  return map[code] || code
}

function productAvailability(product) {
  if (product?.demoTag === DEMO_MARKER || product?.displayMode === 'DEMO' || product?.orderable === false) return 'DEMO_NOT_ORDERABLE'
  const status = String(product?.status || '').toUpperCase()
  if (['DRAFT', 'HIDDEN', 'ARCHIVED'].includes(status)) return 'PRODUCT_UNAVAILABLE'
  return ''
}

/**
 * Build a Worker request handler around a trusted repository.
 *
 * The repository must perform Firebase reads and the final idempotent write
 * server-side. It must not be backed by client Firebase credentials.
 */
export function createOrderBackend({ authenticate, repository, rateLimit, now = () => Date.now(), createOrderId = () => crypto.randomUUID() }) {
  if (typeof authenticate !== 'function' || !repository || typeof repository.readSnapshot !== 'function' || typeof repository.claimIdempotency !== 'function' || typeof repository.writeOrderAtomically !== 'function') {
    throw new Error('ORDER_BACKEND_REPOSITORY_INCOMPLETE')
  }

  return async function handleOrder(request) {
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
    if (typeof rateLimit === 'function' && !(await rateLimit(request))) return json({ error: 'RATE_LIMITED' }, 429)

    let claims
    try {
      claims = await authenticate(request)
    } catch {
      return json({ error: 'UNAUTHENTICATED' }, 401)
    }
    let uid
    try { uid = assertAuthenticated(claims) } catch (error) { return json({ error: error.code }, error.status) }

    let input
    try { input = await request.json() } catch { return json({ error: 'INVALID_JSON' }, 400) }
    let normalized
    try { normalized = normalizeOrderInput(input) } catch (error) { return json({ error: error.message }, 400) }

    const existing = await repository.getIdempotency?.(uid, normalized.idempotencyKey)
    if (existing?.status === 'COMPLETE' && existing.orderId) return json({ orderId: existing.orderId, reused: true, total: existing.total })

    const claim = await repository.claimIdempotency(uid, normalized.idempotencyKey, { status: 'CREATING', createdAt: now() })
    if (!claim?.claimed) {
      if (claim?.existing?.status === 'COMPLETE' && claim.existing.orderId) return json({ orderId: claim.existing.orderId, reused: true, total: claim.existing.total })
      return json({ error: 'DUPLICATE_ORDER_IN_PROGRESS' }, 409)
    }

    const orderId = claim.orderId || createOrderId()
    try {
      const snapshot = publicSnapshot(await repository.readSnapshot())
      for (const item of normalized.items) {
        const availability = productAvailability(snapshot.products[item.productId])
        if (availability) throw new OrderBackendError(availability, 400)
      }
      const order = calculateOrder(normalized, snapshot.products, snapshot.delivery, snapshot.paymentMethods, snapshot.discounts, snapshot.settings)
      const record = safeOrderRecord(order, uid, orderId, now())
      await repository.writeOrderAtomically({ shopId: SHOP_ID, uid, orderId, idempotencyKey: normalized.idempotencyKey, record })
      return json({ orderId, reused: false, paymentStatus: record.paymentStatus, total: record.total }, 201)
    } catch (error) {
      await repository.releaseIdempotency?.(uid, normalized.idempotencyKey, orderId)
      const code = error instanceof OrderBackendError ? error.code : error instanceof Error ? validationError(error.message) : 'INTERNAL_ERROR'
      const expected = new Set(['DEMO_NOT_ORDERABLE', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'INVALID_DELIVERY', 'INVALID_PAYMENT', 'INVALID_DISCOUNT'])
      return json({ error: expected.has(code) ? code : 'INTERNAL_ERROR' }, expected.has(code) ? 400 : 503)
    }
  }
}

export { OrderBackendError }
