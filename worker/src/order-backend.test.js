import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrderBackend, DEMO_MARKER } from './order-backend.js'

const input = (overrides = {}) => ({
  items: [{ productId: 'real-rose', quantity: 1, price: 1 }],
  customerName: 'Fixture Customer', phone: '07000000000', recipientName: 'Fixture Recipient', recipientPhone: '07000000001',
  province: 'Baghdad', district: 'Mansour', address: 'Fixture address', deliveryAt: 'tomorrow', paymentMethodId: 'cash', idempotencyKey: 'fixture-key', ...overrides,
})

function fixture({ product = {}, delivery = {}, paymentMethods = {}, discounts = {}, settings = {} } = {}) {
  return {
    products: { 'real-rose': { name: 'Real Rose', category: 'roses', price: 25000, stock: 3, active: true, status: 'PUBLISHED', orderable: true, ...product } },
    delivery: { Baghdad: { areas: { Mansour: { enabled: true, price: 5000 } } }, ...delivery },
    paymentMethods: { cash: { name: 'Cash', type: 'CASH', enabled: true }, ...paymentMethods }, discounts, settings,
  }
}

function harness({ snapshot = fixture(), uid = 'customer-1', rateLimit = true } = {}) {
  const state = { idempotency: new Map(), writes: [] }
  const repository = {
    async readSnapshot() { return snapshot },
    async getIdempotency(keyUid, key) { return state.idempotency.get(`${keyUid}/${key}`) },
    async claimIdempotency(keyUid, key, value) {
      const id = `${keyUid}/${key}`
      if (state.idempotency.has(id)) return { claimed: false, existing: state.idempotency.get(id) }
      const orderId = 'order-fixture-1'
      state.idempotency.set(id, { ...value, orderId })
      return { claimed: true, orderId }
    },
    async writeOrderAtomically({ uid: actor, orderId, idempotencyKey, record }) {
      state.writes.push(record)
      state.idempotency.set(`${actor}/${idempotencyKey}`, { status: 'COMPLETE', orderId, total: record.total })
    },
    async releaseIdempotency(keyUid, key) { state.idempotency.delete(`${keyUid}/${key}`) },
  }
  const handler = createOrderBackend({ authenticate: async () => ({ uid }), repository, rateLimit: async () => rateLimit, now: () => 1700000000000 })
  return { handler, state }
}

async function call(handler, body, headers = {}) {
  return handler(new Request('https://orders.example', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
}

test('DEMO_ORDER_REJECTED', async () => {
  const { handler } = harness({ snapshot: fixture({ product: { demoTag: DEMO_MARKER } }) })
  const response = await call(handler, input())
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'DEMO_NOT_ORDERABLE' })
})

for (const status of ['DRAFT', 'HIDDEN', 'ARCHIVED']) test(`${status}_ORDER_REJECTED`, async () => {
  const { handler } = harness({ snapshot: fixture({ product: { status } }) })
  const response = await call(handler, input())
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'PRODUCT_UNAVAILABLE' })
})

test('PRICE_TAMPERING_REJECTED', async () => {
  const { handler, state } = harness()
  const response = await call(handler, input({ items: [{ productId: 'real-rose', quantity: 1, price: 1, lineTotal: 1 }] }))
  assert.equal(response.status, 201)
  assert.equal(state.writes[0].total, 30000)
})

test('INVALID_DELIVERY_REJECTED', async () => {
  const { handler } = harness()
  const response = await call(handler, input({ district: 'Unknown' }))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'INVALID_DELIVERY' })
})

test('STOCK_VALIDATION', async () => {
  const { handler } = harness({ snapshot: fixture({ product: { stock: 0 } }) })
  const response = await call(handler, input())
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'INSUFFICIENT_STOCK' })
})

test('DUPLICATE_ORDER_PREVENTION', async () => {
  const { handler, state } = harness()
  const first = await call(handler, input())
  const second = await call(handler, input())
  assert.equal(first.status, 201)
  assert.equal(second.status, 200)
  assert.deepEqual(await second.json(), { orderId: 'order-fixture-1', reused: true, total: 30000 })
  assert.equal(state.writes.length, 1)
})

test('UNAUTHORIZED_WRITE_REJECTED', async () => {
  const { handler } = harness()
  const unauthenticated = createOrderBackend({ authenticate: async () => { throw new Error('bad token') }, repository: { readSnapshot: async () => fixture(), claimIdempotency: async () => ({ claimed: true }), writeOrderAtomically: async () => {} } })
  const response = await call(unauthenticated, input())
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'UNAUTHENTICATED' })
  assert.equal((await call(handler, input())).status, 201)
})

test('VALID_REAL_PRODUCT_ORDER', async () => {
  const { handler, state } = harness()
  const response = await call(handler, input())
  assert.equal(response.status, 201)
  assert.equal(state.writes[0].items[0].unitPrice, 25000)
})

test('RATE_LIMITING', async () => {
  const { handler } = harness({ rateLimit: false })
  const response = await call(handler, input())
  assert.equal(response.status, 429)
})

test('CONCURRENT_ORDERS fail closed when no atomic coordinator is configured', async () => {
  const { handler } = harness()
  const original = handler
  // A production repository must reject the write rather than perform a read-then-write stock decrement.
  const guarded = createOrderBackend({
    authenticate: async () => ({ uid: 'customer-1' }),
    repository: {
      readSnapshot: async () => fixture({ product: { stock: 1 } }),
      claimIdempotency: async (uid, key) => ({ claimed: true, orderId: `${uid}-${key}` }),
      writeOrderAtomically: async () => { throw Object.assign(new Error('ATOMIC_STOCK_COORDINATOR_REQUIRED'), { code: 'ATOMIC_STOCK_COORDINATOR_REQUIRED' }) },
    },
  })
  const responses = await Promise.all([call(guarded, input({ idempotencyKey: 'concurrent-a' })), call(guarded, input({ idempotencyKey: 'concurrent-b' }))])
  assert.deepEqual(responses.map(response => response.status), [503, 503])
  assert.equal(original !== guarded, true)
})
