import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to run without a local Database Emulator.')
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(functionsHost)) throw new Error('Refusing to run without a local Functions Emulator.')

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `integration-${Date.now()}`)
const database = getDatabase(app)

async function responseJson(response) {
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* retain raw response in the error */ }
  return { response, body, text }
}

async function signUp(label) {
  const email = `${label}-${Date.now()}@example.test`
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'LocalOnly-123456', returnSecureToken: true }),
  })
  const { body, text } = await responseJson(response)
  if (!response.ok || !body?.idToken || !body?.localId) throw new Error(`Auth emulator signup failed (${response.status}): ${text}`)
  return { uid: body.localId, token: body.idToken, email }
}

async function callFunction(name, token, data) {
  const response = await fetch(`http://${functionsHost}/${SHOP_ID}/europe-west1/${name}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }),
  })
  const { body, text } = await responseJson(response)
  if (!response.ok || body?.error) throw new Error(`${name} failed (${response.status}): ${text}`)
  return body.result
}

async function expectFunctionError(name, token, data, expectedStatus) {
  const response = await fetch(`http://${functionsHost}/${SHOP_ID}/europe-west1/${name}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }),
  })
  const { body, text } = await responseJson(response)
  assert.equal(body?.error?.status, expectedStatus, `${name} returned an unexpected error: ${text}`)
}

const root = database.ref(`shops/${SHOP_ID}`)
try {
  const customer = await signUp('customer')
  const admin = await signUp('admin')
  const otherCustomer = await signUp('other')
  const staff = await signUp('staff')
  const viewer = await signUp('viewer')
  await database.ref(`shopMemberships/${admin.uid}/${SHOP_ID}`).set({ role: 'ADMIN', active: true, permissions: { orders: true, products: true, inventory: true, catalog: true, staff: true, audit: true, settings: true } })
  await database.ref(`shopMemberships/${viewer.uid}/${SHOP_ID}`).set({ role: 'VIEWER', active: true, permissions: { catalog: true } })
  await root.set({
    products: { rose: { name: 'Synthetic rose', price: 40000, category: 'roses', status: 'PUBLISHED', active: true, stock: 2, inventoryRecipe: { wrap: 1 } } },
    public: { delivery: { Najaf: { areas: { University: { price: 5000, enabled: true } } } }, paymentMethods: { cash: { name: 'Cash', type: 'CASH', enabled: true }, zain: { name: 'Synthetic ZainCash', type: 'ZAINCASH', enabled: true, walletName: 'Synthetic wallet', walletNumber: '07700000002' } }, discounts: {} },
    private: { inventory: { wrap: { name: 'Synthetic wrap', quantity: 3, active: true, status: 'ACTIVE' } } },
  })

  await callFunction('setStaffMembership', admin.token, { uid: staff.uid, email: staff.email, displayName: 'Synthetic Staff', role: 'EMPLOYEE', active: true, permissions: { catalog: true, products: false, orders: false, inventory: false, customers: false, audit: false, settings: false, staff: false } })
  const staffMembership = await database.ref(`shopMemberships/${staff.uid}/${SHOP_ID}`).get()
  const staffRecord = await root.child(`private/staff/${staff.uid}`).get()
  assert.equal(staffMembership.val().role, 'EMPLOYEE')
  assert.equal(staffMembership.val().permissions.products, false)
  assert.equal(staffRecord.val().email, staff.email)

  const category = await callFunction('adminWrite', admin.token, { operation: 'create', path: `shops/${SHOP_ID}/public/categories`, value: { name: 'Synthetic category', visible: true, active: true } })
  assert.match(category.key, /^[A-Za-z0-9_-]+$/)
  const product = await callFunction('adminWrite', admin.token, { operation: 'create', path: `shops/${SHOP_ID}/products`, value: { name: 'Synthetic catalog product', price: 12000, status: 'DRAFT', active: false, category: category.key, imageUrls: ['https://example.test/synthetic.jpg'] } })
  assert.match(product.key, /^[A-Za-z0-9_-]+$/)
  const productsRead = await callFunction('adminRead', admin.token, { path: `shops/${SHOP_ID}/products` })
  assert.equal(productsRead.data[product.key].status, 'DRAFT')
  await callFunction('adminWrite', admin.token, { operation: 'update', path: `shops/${SHOP_ID}/public/categories/${category.key}`, value: { visible: false, active: false, status: 'ARCHIVED' } })
  const archivedCategory = await root.child(`public/categories/${category.key}`).get()
  assert.equal(archivedCategory.val().status, 'ARCHIVED')
  assert.equal((await root.child(`products/${product.key}`).get()).exists(), true)
  await expectFunctionError('adminWrite', admin.token, { operation: 'delete', path: `shops/${SHOP_ID}/products/${product.key}` }, 'FAILED_PRECONDITION')
  await expectFunctionError('adminWrite', viewer.token, { operation: 'create', path: `shops/${SHOP_ID}/public/categories`, value: { name: 'Unauthorized synthetic category' } }, 'PERMISSION_DENIED')

  const input = { items: [{ productId: 'rose', quantity: 1, packaging: 'Premium wrap', addOns: ['Ribbon'], giftMessage: 'Local test' }], customerName: 'Synthetic Customer', phone: '07700000000', recipientName: 'Synthetic Recipient', recipientPhone: '07700000001', province: 'Najaf', district: 'University', address: 'Local emulator only', deliveryAt: '2026-10-20T12:00', paymentMethodId: 'cash', idempotencyKey: 'local-integration-order-1' }
  const created = await callFunction('createOrder', customer.token, input)
  assert.equal(created.paymentStatus, 'UNPAID')
  assert.equal(created.total, 45000)
  const retry = await callFunction('createOrder', customer.token, input)
  assert.equal(retry.orderId, created.orderId)
  assert.equal(retry.reused, true)
  const ownerOrder = await callFunction('getCustomerOrder', customer.token, { orderId: created.orderId })
  assert.equal(ownerOrder.orderId, created.orderId)
  await expectFunctionError('getCustomerOrder', otherCustomer.token, { orderId: created.orderId }, 'NOT_FOUND')
  await callFunction('confirmOrderPayment', admin.token, { orderId: created.orderId })
  const approved = await callFunction('approveOrder', admin.token, { orderId: created.orderId })
  assert.equal(approved.orderStatus, 'APPROVED')
  const repeatApproval = await callFunction('approveOrder', admin.token, { orderId: created.orderId })
  assert.equal(repeatApproval.reused, true)
  await expectFunctionError('setOrderStatus', admin.token, { orderId: created.orderId, orderStatus: 'DELIVERED' }, 'FAILED_PRECONDITION')

  const [orderSnapshot, productSnapshot, inventorySnapshot, reservationSnapshot] = await Promise.all([
    root.child(`private/orders/${created.orderId}`).get(), root.child('products/rose').get(), root.child('private/inventory/wrap').get(), root.child(`private/orderReservations/${created.orderId}`).get(),
  ])
  assert.equal(orderSnapshot.val().orderStatus, 'APPROVED')
  assert.equal(orderSnapshot.val().paymentStatus, 'CONFIRMED')
  assert.equal(productSnapshot.val().stock, 1)
  assert.equal(inventorySnapshot.val().quantity, 2)
  assert.equal(reservationSnapshot.val().status, 'RESERVED')
  const transferOrder = await callFunction('createOrder', customer.token, { ...input, paymentMethodId: 'zain', transferReference: 'SYNTHETIC-REF-1', idempotencyKey: 'local-integration-order-2' })
  assert.equal(transferOrder.paymentStatus, 'PENDING_REVIEW')
  const transferSnapshot = await root.child(`private/orders/${transferOrder.orderId}`).get()
  assert.equal(transferSnapshot.val().transferReference, 'SYNTHETIC-REF-1')
  console.log(JSON.stringify({ orderId: created.orderId, total: created.total, retryReused: retry.reused, ownerOnlyRead: true, paymentStatus: orderSnapshot.val().paymentStatus, orderStatus: orderSnapshot.val().orderStatus, stock: productSnapshot.val().stock, materialQuantity: inventorySnapshot.val().quantity, reservation: reservationSnapshot.val().status, transferOrderStatus: transferOrder.paymentStatus, transferReferenceReadback: transferSnapshot.val().transferReference }, null, 2))
} finally {
  await root.remove()
  await database.ref('shopMemberships').remove()
  await deleteApp(app)
}
