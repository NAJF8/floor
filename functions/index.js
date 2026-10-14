import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { calculateOrder, normalizeOrderInput, SHOP_ID } from './src/order.js'

const emulatorMode = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR)

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

const roleOrder = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 }

async function requireStaff(request, permission, minimumRole = 'EMPLOYEE') {
  const uid = authUid(request)
  const token = request.auth?.token || {}
  if (!emulatorMode && token.firebase?.sign_in_provider && token.firebase.sign_in_provider !== 'google.com') {
    throw new HttpsError('permission-denied', 'Google sign-in is required for administration.')
  }
  if (!emulatorMode && token.email_verified === false) throw new HttpsError('permission-denied', 'A verified administrator account is required.')
  const membership = (await database.ref(`shopMemberships/${uid}/${SHOP_ID}`).get()).val()
  const role = membership?.role
  if (membership?.active !== true || !role || (roleOrder[role] || -1) < (roleOrder[minimumRole] || 0)) {
    throw new HttpsError('permission-denied', 'This account is not authorized for this operation.')
  }
  if (role !== 'SUPER_ADMIN' && membership.permissions && membership.permissions[permission] === false) {
    throw new HttpsError('permission-denied', `Missing permission: ${permission}`)
  }
  return { uid, role, membership }
}

function orderPath(orderId) { return `shops/${SHOP_ID}/private/orders/${orderId}` }
function activityPath() { return `shops/${SHOP_ID}/private/activityLogs/${database.ref().push().key}` }
function idText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 120) throw new HttpsError('invalid-argument', `Invalid ${field}.`)
  return value.trim()
}

function adminWritePolicy(path) {
  const prefix = `shops/${SHOP_ID}/`
  if (typeof path !== 'string' || !path.startsWith(prefix) || path.includes('..') || path.includes('//')) throw new HttpsError('invalid-argument', 'Invalid administrative path.')
  const suffix = path.slice(prefix.length)
  if (suffix === 'products' || suffix.startsWith('products/')) return { permission: 'products', minimumRole: 'MANAGER' }
  if (suffix.startsWith('public/categories') || suffix.startsWith('public/discounts') || suffix.startsWith('public/delivery') || suffix.startsWith('public/paymentMethods') || suffix.startsWith('public/homepage') || suffix.startsWith('public/aiAssistant')) return { permission: 'catalog', minimumRole: 'MANAGER' }
  if (suffix.startsWith('public/settings')) return { permission: 'settings', minimumRole: 'ADMIN' }
  if (suffix === 'private/inventory' || suffix.startsWith('private/inventory/')) return { permission: 'inventory', minimumRole: 'MANAGER' }
  if (suffix === 'private/staff' || suffix.startsWith('private/staff/')) throw new HttpsError('permission-denied', 'Use setStaffMembership to link a verified Firebase UID.')
  throw new HttpsError('permission-denied', 'This path is not writable from the admin client.')
}

function adminReadPolicy(path) {
  const prefix = `shops/${SHOP_ID}/`
  if (typeof path !== 'string' || !path.startsWith(prefix) || path.includes('..') || path.includes('//')) throw new HttpsError('invalid-argument', 'Invalid administrative path.')
  const suffix = path.slice(prefix.length)
  if (suffix === 'private/orders' || suffix.startsWith('private/orders/')) return { permission: 'orders', minimumRole: 'EMPLOYEE' }
  if (suffix === 'private/inventory' || suffix.startsWith('private/inventory/')) return { permission: 'inventory', minimumRole: 'EMPLOYEE' }
  if (suffix === 'private/customers' || suffix.startsWith('private/customers/')) return { permission: 'customers', minimumRole: 'MANAGER' }
  if (suffix === 'private/activityLogs' || suffix.startsWith('private/activityLogs/')) return { permission: 'audit', minimumRole: 'MANAGER' }
  if (suffix === 'private/staff' || suffix.startsWith('private/staff/')) return { permission: 'staff', minimumRole: 'ADMIN' }
  if (suffix === 'private/payments' || suffix.startsWith('private/payments/')) return { permission: 'orders', minimumRole: 'MANAGER' }
  throw new HttpsError('permission-denied', 'This private path is not readable from the admin client.')
}

function rejectSensitiveFields(value) {
  const serialized = JSON.stringify(value || {}).toLowerCase()
  if (/(pin|cvv|cvc|expiry|expiration|cardnumber|serviceaccount|github.?token|private.?key)/.test(serialized)) throw new HttpsError('invalid-argument', 'Sensitive payment or secret fields are not accepted.')
}

export const adminWrite = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const operation = idText(request.data?.operation, 'operation')
  const path = idText(request.data?.path, 'path')
  const policy = adminWritePolicy(path)
  const actor = await requireStaff(request, policy.permission, policy.minimumRole)
  const target = database.ref(path)
  rejectSensitiveFields(request.data?.value)
  const now = Date.now()
  const audit = (key, extra = {}) => ({ action: 'ADMIN_WRITE', operation, path, recordKey: key || '', actorUid: actor.uid, createdAt: now, ...extra })
  if (operation === 'create') {
    const record = target.push()
    const updates = {}
    updates[`${path}/${record.key}`] = { ...(request.data?.value || {}), createdAt: now, updatedAt: now }
    updates[activityPath()] = audit(record.key)
    await database.ref().update(updates)
    return { key: record.key, actorUid: actor.uid }
  }
  if (operation === 'update') {
    if (!request.data?.value || typeof request.data.value !== 'object' || Array.isArray(request.data.value)) throw new HttpsError('invalid-argument', 'Update data must be an object.')
    const updates = { [path]: { ...request.data.value, updatedAt: now }, [activityPath()]: audit(target.key) }
    await database.ref().update(updates)
    return { actorUid: actor.uid }
  }
  if (operation === 'delete') {
    const updates = { [path]: null, [activityPath()]: audit(target.key) }
    await database.ref().update(updates)
    return { actorUid: actor.uid }
  }
  if (operation === 'replace') {
    const updates = { [path]: request.data?.value ?? null, [activityPath()]: audit(target.key) }
    await database.ref().update(updates)
    return { actorUid: actor.uid }
  }
  throw new HttpsError('invalid-argument', 'Unsupported administrative operation.')
})

export const adminRead = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const path = idText(request.data?.path, 'path')
  const policy = adminReadPolicy(path)
  await requireStaff(request, policy.permission, policy.minimumRole)
  const snapshot = await database.ref(path).get()
  return { path, data: snapshot.exists() ? snapshot.val() : null }
})

export const setStaffMembership = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const actor = await requireStaff(request, 'staff', 'ADMIN')
  const uid = idText(request.data?.uid, 'uid')
  const role = idText(request.data?.role, 'role')
  const allowedRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER'])
  if (!allowedRoles.has(role)) throw new HttpsError('invalid-argument', 'Unsupported staff role.')
  if (role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') throw new HttpsError('permission-denied', 'Only a Super Admin can assign Super Admin.')
  let authUser
  try { authUser = await getAuth().getUser(uid) } catch { throw new HttpsError('not-found', 'Firebase Auth UID was not found.') }
  if (request.data?.email && request.data.email !== authUser.email) throw new HttpsError('failed-precondition', 'The supplied email does not match the Firebase UID.')
  const membershipRef = database.ref(`shopMemberships/${uid}/${SHOP_ID}`)
  const current = (await membershipRef.get()).val()
  if (current?.immutableBootstrap && (current.role !== role || current.active !== request.data?.active)) throw new HttpsError('permission-denied', 'Bootstrap Super Admin membership is immutable.')
  const active = request.data?.active !== false
  const now = Date.now()
  const permissionNames = ['products', 'catalog', 'orders', 'inventory', 'customers', 'audit', 'settings', 'staff']
  const requestedPermissions = request.data?.permissions
  const permissions = { ...(current?.permissions || {}) }
  if (!current?.immutableBootstrap && requestedPermissions && typeof requestedPermissions === 'object' && !Array.isArray(requestedPermissions)) {
    for (const permission of permissionNames) if (typeof requestedPermissions[permission] === 'boolean') permissions[permission] = requestedPermissions[permission]
  }
  const record = { uid, email: authUser.email || '', displayName: typeof request.data?.displayName === 'string' ? request.data.displayName.trim().slice(0, 120) : authUser.displayName || '', role, active, permissions, updatedAt: now, ...(current?.createdAt ? { createdAt: current.createdAt } : { createdAt: now }) }
  const updates = {}
  updates[`shopMemberships/${uid}/${SHOP_ID}`] = { ...record, permissions, ...(current?.immutableBootstrap ? { immutableBootstrap: true } : {}) }
  updates[`shops/${SHOP_ID}/private/staff/${uid}`] = record
  updates[activityPath()] = { action: 'STAFF_MEMBERSHIP_UPDATED', actorUid: actor.uid, targetUid: uid, role, active, createdAt: now }
  await database.ref().update(updates)
  return { uid, email: authUser.email || '', role, active }
})

export const confirmOrderPayment = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const actor = await requireStaff(request, 'orders', 'MANAGER')
  const orderId = idText(request.data?.orderId, 'orderId')
  const orderRef = database.ref(orderPath(orderId))
  const before = (await orderRef.get()).val()
  if (!before) throw new HttpsError('not-found', 'Order not found.')
  if (before.orderStatus === 'CANCELLED' || before.orderStatus === 'REJECTED') throw new HttpsError('failed-precondition', 'A cancelled or rejected order cannot be paid.')
  if (before.paymentStatus === 'CONFIRMED') return { orderId, reused: true, paymentStatus: 'CONFIRMED' }
  const now = Date.now()
  const result = await orderRef.transaction((current) => {
    if (!current || current.paymentStatus === 'CONFIRMED') return current
    return { ...current, paymentStatus: 'CONFIRMED', paidAmount: current.total, paymentConfirmedBy: actor.uid, paymentConfirmedAt: now, updatedAt: now }
  })
  const after = result.snapshot.val()
  if (!after) throw new HttpsError('not-found', 'Order not found.')
  if (after.paymentStatus !== 'CONFIRMED') throw new HttpsError('aborted', 'Payment confirmation was not committed.')
  if (after.paymentConfirmedBy !== actor.uid || after.paymentConfirmedAt !== now) return { orderId, reused: true, paymentStatus: 'CONFIRMED' }
  const updates = {}
  updates[`shops/${SHOP_ID}/private/payments/${orderId}`] = { orderId, amount: after.paidAmount, method: after.paymentMethod, reference: after.transferReference || '', status: 'CONFIRMED', confirmedBy: actor.uid, confirmedAt: now }
  updates[activityPath()] = { action: 'PAYMENT_CONFIRMED', actorUid: actor.uid, orderId, amount: after.paidAmount, paymentMethod: after.paymentMethod?.id || '', createdAt: now }
  await database.ref().update(updates)
  return { orderId, reused: false, paymentStatus: 'CONFIRMED' }
})

function prepareApproval(shopData, orderId, actorUid, now) {
  const order = shopData?.private?.orders?.[orderId]
  if (!order) return { error: 'ORDER_NOT_FOUND' }
  if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') return { error: 'ORDER_TERMINAL' }
  const paymentType = order.paymentMethod?.type
  if (paymentType !== 'CASH' && order.paymentStatus !== 'CONFIRMED') return { error: 'PAYMENT_NOT_CONFIRMED' }
  const existing = shopData.private?.orderReservations?.[orderId]
  if (existing?.status === 'RESERVED') return { reused: true, order }
  const products = shopData.products || {}
  const inventory = shopData.private?.inventory || {}
  const consumed = {}
  for (const item of Array.isArray(order.items) ? order.items : []) {
    const product = products[item.productId]
    if (!product) return { error: 'PRODUCT_UNAVAILABLE' }
    if (Number.isInteger(product.stock)) {
      if (product.stock < item.quantity) return { error: 'INSUFFICIENT_STOCK' }
    }
    for (const [materialId, units] of Object.entries(item.inventoryRecipe || {})) {
      const material = inventory[materialId]
      const required = units * item.quantity
      if (!material || material.active === false || material.status === 'ARCHIVED' || !Number.isInteger(material.quantity) || material.quantity < required) return { error: 'INSUFFICIENT_MATERIAL' }
      consumed[materialId] = (consumed[materialId] || 0) + required
    }
  }
  const updates = {}
  for (const item of order.items || []) {
    const product = products[item.productId]
    if (Number.isInteger(product.stock)) updates[`shops/${SHOP_ID}/products/${item.productId}/stock`] = product.stock - item.quantity
  }
  for (const [materialId, required] of Object.entries(consumed)) updates[`shops/${SHOP_ID}/private/inventory/${materialId}/quantity`] = inventory[materialId].quantity - required
  updates[`shops/${SHOP_ID}/private/orders/${orderId}`] = { ...order, orderStatus: 'APPROVED', inventoryStatus: 'RESERVED', inventoryReservationId: orderId, updatedAt: now }
  updates[`shops/${SHOP_ID}/private/orderReservations/${orderId}`] = { status: 'RESERVED', orderId, actorUid, consumed, createdAt: now }
  updates[activityPath()] = { action: 'ORDER_APPROVED_INVENTORY_RESERVED', actorUid, orderId, consumed, createdAt: now }
  return { updates, order, reused: false }
}

export const approveOrder = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const actor = await requireStaff(request, 'orders', 'MANAGER')
  const orderId = idText(request.data?.orderId, 'orderId')
  const lockRef = database.ref(`shops/${SHOP_ID}/private/inventoryLock`)
  const lockToken = `${actor.uid}:${Math.random().toString(36).slice(2)}`
  const now = Date.now()
  const lock = await lockRef.transaction((current) => current && current.expiresAt > now ? current : { token: lockToken, expiresAt: now + 30000 })
  if (!lock.committed || lock.snapshot.val()?.token !== lockToken) throw new HttpsError('aborted', 'Inventory is busy; try again.')
  try {
    // Read the individual branches after taking the lock. Child reads avoid a
    // stale parent snapshot in the Admin SDK/emulator and keep the transaction
    // scope limited to the order, catalog stock, and material inventory.
    const [orderSnapshot, productsSnapshot, inventorySnapshot, reservationSnapshot] = await Promise.all([
      database.ref(orderPath(orderId)).get(),
      database.ref(`shops/${SHOP_ID}/products`).get(),
      database.ref(`shops/${SHOP_ID}/private/inventory`).get(),
      database.ref(`shops/${SHOP_ID}/private/orderReservations/${orderId}`).get(),
    ])
    const shopData = { products: productsSnapshot.val() || {}, private: { orders: { [orderId]: orderSnapshot.val() }, inventory: inventorySnapshot.val() || {}, orderReservations: { [orderId]: reservationSnapshot.val() } } }
    const prepared = prepareApproval(shopData, orderId, actor.uid, now)
    if (prepared.error) {
      const map = { ORDER_NOT_FOUND: 'not-found', ORDER_TERMINAL: 'failed-precondition', PAYMENT_NOT_CONFIRMED: 'failed-precondition', PRODUCT_UNAVAILABLE: 'failed-precondition', INSUFFICIENT_STOCK: 'failed-precondition', INSUFFICIENT_MATERIAL: 'failed-precondition' }
      throw new HttpsError(map[prepared.error] || 'failed-precondition', prepared.error)
    }
    if (prepared.reused) return { orderId, reused: true, orderStatus: prepared.order.orderStatus, inventoryStatus: prepared.order.inventoryStatus }
    await database.ref().update(prepared.updates)
    return { orderId, reused: false, orderStatus: 'APPROVED', inventoryStatus: 'RESERVED' }
  } finally {
    await lockRef.transaction((current) => current?.token === lockToken ? null : current)
  }
})

export const setOrderStatus = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const actor = await requireStaff(request, 'orders', 'EMPLOYEE')
  const orderId = idText(request.data?.orderId, 'orderId')
  const nextStatus = idText(request.data?.orderStatus, 'orderStatus')
  const allowed = new Set(['NEW', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'PAYMENT_CONFIRMED', 'APPROVED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'])
  if (!allowed.has(nextStatus) || ['PAYMENT_CONFIRMED', 'APPROVED'].includes(nextStatus)) throw new HttpsError('invalid-argument', 'Use the dedicated payment or approval action.')
  const orderRef = database.ref(orderPath(orderId))
  const result = await orderRef.transaction((current) => current ? { ...current, orderStatus: nextStatus, updatedAt: Date.now() } : undefined)
  if (!result.committed) throw new HttpsError('not-found', 'Order not found.')
  const now = Date.now()
  await database.ref().update({ [activityPath()]: { action: 'ORDER_STATUS_CHANGED', actorUid: actor.uid, orderId, orderStatus: nextStatus, createdAt: now } })
  return { orderId, orderStatus: result.snapshot.val()?.orderStatus, reused: result.snapshot.val()?.updatedAt !== now }
})

function toHttpsError(error) {
  const code = error instanceof Error ? error.message : 'INVALID_ORDER'
  const known = new Set(['INVALID_ORDER', 'INVALID_ITEMS', 'INVALID_ITEM', 'DUPLICATE_PRODUCT', 'INVALID_PRODUCT_ID', 'INVALID_QUANTITY', 'INVALID_CUSTOMER_NAME', 'INVALID_PHONE', 'INVALID_RECIPIENT_NAME', 'INVALID_RECIPIENT_PHONE', 'INVALID_PROVINCE', 'INVALID_DISTRICT', 'INVALID_ADDRESS', 'INVALID_DELIVERY_AT', 'INVALID_PAYMENT_METHOD_ID', 'INVALID_IDEMPOTENCY_KEY', 'PRODUCT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'PAYMENT_METHOD_UNAVAILABLE', 'DELIVERY_AREA_UNCONFIGURED', 'DISCOUNT_UNAVAILABLE'])
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
  let discountReservation = null
  let preparedOrder = null

  try {
    const [productsSnapshot, deliverySnapshot, paymentSnapshot, discountsSnapshot] = await Promise.all([
      database.ref(`shops/${SHOP_ID}/products`).get(),
      database.ref(`shops/${SHOP_ID}/public/delivery`).get(),
      database.ref(`shops/${SHOP_ID}/public/paymentMethods`).get(),
      database.ref(`shops/${SHOP_ID}/public/discounts`).get(),
    ])
    const order = calculateOrder(input, productsSnapshot.val() || {}, deliverySnapshot.val() || {}, paymentSnapshot.val() || {}, discountsSnapshot.val() || {})
    preparedOrder = order
    if (order.discountDetail?.id) {
      const discountRef = database.ref(`shops/${SHOP_ID}/public/discounts/${order.discountDetail.id}`)
      const discountSnapshot = await discountRef.get()
      const discountValue = discountSnapshot.val() || {}
      const usage = await discountRef.child('usageCount').transaction((current) => {
        const count = Number.isInteger(current) && current >= 0 ? current : 0
        if (Number.isInteger(discountValue.maxUses) && count >= discountValue.maxUses) return
        return count + 1
      })
      if (!usage.committed) throw new Error('DISCOUNT_UNAVAILABLE')
      await discountRef.child(`usageOrders/${orderId}`).set(true)
      discountReservation = discountRef
    }
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
    const updates = {}
    updates[`shops/${SHOP_ID}/private/orders/${orderId}`] = record
    updates[`shops/${SHOP_ID}/private/activityLogs/${database.ref().push().key}`] = { action: 'ORDER_CREATED', actorUid: uid, orderId, createdAt: now }
    updates[`shops/${SHOP_ID}/private/orderRequests/${uid}/${input.idempotencyKey}`] = { status: 'COMPLETE', orderId, createdAt: claimValue?.createdAt || now, completedAt: now }
    await database.ref().update(updates)
    return { orderId, reused: false, paymentStatus: record.paymentStatus, total: record.total }
  } catch (error) {
    if (discountReservation) {
      try {
        await discountReservation.child('usageOrders').child(orderId).remove()
        await discountReservation.child('usageCount').transaction((current) => {
          const count = Number.isInteger(current) && current > 0 ? current : 0
          return count > 0 ? count - 1 : 0
        })
      } catch (compensationError) {
        console.error('Discount reservation compensation failed', { orderId, discountId: preparedOrder?.discountDetail?.id, compensationError })
      }
    }
    throw toHttpsError(error)
  }
})

export const getCustomerOrder = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const uid = authUid(request)
  const orderId = idText(request.data?.orderId, 'orderId')
  const snapshot = await database.ref(orderPath(orderId)).get()
  const order = snapshot.val()
  if (!order || order.uid !== uid) throw new HttpsError('not-found', 'Order not found.')
  return {
    orderId,
    orderStatus: order.orderStatus || 'NEW',
    paymentStatus: order.paymentStatus || 'UNPAID',
    total: Number.isInteger(order.total) ? order.total : 0,
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null,
    deliveryAt: order.deliveryAt || '',
    items: Array.isArray(order.items) ? order.items.map(item => ({ name: item.name || '', quantity: item.quantity || 0, lineTotal: item.lineTotal || 0 })) : [],
  }
})

export const syncCustomerFavorites = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const uid = authUid(request)
  const supplied = request.data?.favoriteIds
  if (!Array.isArray(supplied) || supplied.length > 200 || supplied.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id))) {
    throw new HttpsError('invalid-argument', 'Favorite IDs are invalid.')
  }
  const favoritesRef = database.ref(`users/${uid}/favorites`)
  const current = (await favoritesRef.get()).val()
  const existing = current && typeof current === 'object' && !Array.isArray(current) ? Object.entries(current).filter(([, value]) => value === true).map(([id]) => id) : []
  const favoriteIds = [...new Set([...existing, ...supplied])].slice(0, 200)
  await favoritesRef.set(Object.fromEntries(favoriteIds.map((id) => [id, true])))
  return { favoriteIds }
})

export const listCustomerOrders = onCall({ region: 'europe-west1', enforceAppCheck: false }, async (request) => {
  const uid = authUid(request)
  const snapshot = await database.ref(`shops/${SHOP_ID}/private/orders`).get()
  const value = snapshot.val()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { orders: [] }
  const orders = Object.entries(value)
    .filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item) && item.uid === uid)
    .map(([orderId, item]) => ({
      orderId,
      orderStatus: item.orderStatus || 'NEW',
      paymentStatus: item.paymentStatus || 'UNPAID',
      total: Number.isInteger(item.total) ? item.total : 0,
      deliveryAt: item.deliveryAt || '',
      createdAt: item.createdAt || null,
    }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 20)
  return { orders }
})
