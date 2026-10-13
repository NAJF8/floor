import { getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { calculateOrder, normalizeOrderInput, SHOP_ID } from './src/order.js'

if (!getApps().length) {
  const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  initializeApp({
    projectId: SHOP_ID,
    databaseURL: emulatorHost ? `http://${emulatorHost}?ns=${SHOP_ID}` : 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app',
  })
}
const database = getDatabase()

function authUid(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Google sign-in is required before submitting an order.')
  return request.auth.uid
}

function toHttpsError(error) {
  const code = error instanceof Error ? error.message : 'INVALID_ORDER'
  const known = new Set(['INVALID_ORDER', 'INVALID_ITEMS', 'INVALID_ITEM', 'DUPLICATE_PRODUCT', 'INVALID_PRODUCT_ID', 'INVALID_QUANTITY', 'INVALID_CUSTOMER_NAME', 'INVALID_PHONE', 'INVALID_RECIPIENT_NAME', 'INVALID_RECIPIENT_PHONE', 'INVALID_PROVINCE', 'INVALID_DISTRICT', 'INVALID_ADDRESS', 'INVALID_DELIVERY_AT', 'INVALID_PAYMENT_METHOD_ID', 'INVALID_IDEMPOTENCY_KEY', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'PAYMENT_METHOD_UNAVAILABLE', 'DELIVERY_AREA_UNCONFIGURED'])
  return new HttpsError(known.has(code) ? 'failed-precondition' : 'internal', known.has(code) ? code : 'Order creation failed safely.')
}

export const createOrder = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const uid = authUid(request)
  let input
  try {
    input = normalizeOrderInput(request.data)
  } catch (error) {
    throw toHttpsError(error)
  }

  const requestRef = database.ref(`shops/${SHOP_ID}/private/orderRequests/${uid}/${input.idempotencyKey}`)
  const candidateOrderId = database.ref(`shops/${SHOP_ID}/private/orders`).push().key
  if (!candidateOrderId) throw new HttpsError('internal', 'Could not allocate an order ID.')
  const claim = await requestRef.transaction((current) => current || { status: 'CREATING', orderId: candidateOrderId, createdAt: Date.now() })
  const claimValue = claim.snapshot.val()
  if (claimValue?.status === 'COMPLETE' && claimValue.orderId) return { orderId: claimValue.orderId, reused: true }
  const orderId = claimValue?.orderId || candidateOrderId

  try {
    const [productsSnapshot, deliverySnapshot, paymentSnapshot] = await Promise.all([
      database.ref(`shops/${SHOP_ID}/products`).get(),
      database.ref(`shops/${SHOP_ID}/public/delivery`).get(),
      database.ref(`shops/${SHOP_ID}/public/paymentMethods`).get(),
    ])
    const order = calculateOrder(input, productsSnapshot.val() || {}, deliverySnapshot.val() || {}, paymentSnapshot.val() || {})
    const now = Date.now()
    const record = {
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
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      transferReference: order.transferReference,
      paymentStatus: order.paymentMethod.type === 'CASH' ? 'UNPAID' : 'PENDING_REVIEW',
      orderStatus: 'NEW',
      createdAt: now,
      updatedAt: now,
    }
    const updates = {}
    updates[`shops/${SHOP_ID}/private/orders/${orderId}`] = record
    updates[`shops/${SHOP_ID}/private/activityLogs/${database.ref().push().key}`] = { action: 'ORDER_CREATED', actorUid: uid, orderId, createdAt: now }
    updates[`shops/${SHOP_ID}/private/orderRequests/${uid}/${input.idempotencyKey}`] = { status: 'COMPLETE', orderId, createdAt: claimValue?.createdAt || now, completedAt: now }
    await database.ref().update(updates)
    return { orderId, reused: false, paymentStatus: record.paymentStatus, total: record.total }
  } catch (error) {
    throw toHttpsError(error)
  }
})
