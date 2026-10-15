import test from 'node:test'
import assert from 'node:assert/strict'
import { handleOrderRequest } from './order-worker-entry.js'

const db = {}

test('ORDER_INGEST_DISABLED is fail-closed before authentication', async () => {
  const response = await handleOrderRequest(new Request('https://orders.example/orders', { method: 'POST' }), { DB: db, ORDERS_ENABLED: 'false', ALLOWED_ORIGINS: 'https://shop.example' })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'ORDER_INGEST_DISABLED' })
})

test('order Worker rejects unapproved origins and answers preflight without secrets', async () => {
  const denied = await handleOrderRequest(new Request('https://orders.example/orders', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), { ALLOWED_ORIGINS: 'https://shop.example' })
  assert.equal(denied.status, 403)
  const preflight = await handleOrderRequest(new Request('https://orders.example/orders', { method: 'OPTIONS', headers: { Origin: 'https://shop.example' } }), { ALLOWED_ORIGINS: 'https://shop.example' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://shop.example')
  assert.equal(await preflight.text(), '')
})
