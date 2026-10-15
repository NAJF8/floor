import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedOrigin, enforceRateLimit, readJsonBody, MAX_ORDER_BODY_BYTES } from './order-security.js'

test('CORS allowlist is exact and body limits are enforced', async () => {
  const env = { ALLOWED_ORIGINS: 'https://shop.example, http://localhost:5173' }
  assert.deepEqual(allowedOrigin(new Request('https://orders.example/orders', { headers: { Origin: 'https://shop.example' } }), env), { origin: 'https://shop.example', allowed: true })
  assert.equal(allowedOrigin(new Request('https://orders.example/orders', { headers: { Origin: 'https://shop.example.evil' } }), env).allowed, false)
  await assert.rejects(readJsonBody(new Request('https://orders.example/orders', { body: 'x'.repeat(MAX_ORDER_BODY_BYTES + 1), method: 'POST', headers: { 'content-type': 'application/json' } }), MAX_ORDER_BODY_BYTES), /REQUEST_BODY_TOO_LARGE/)
})

test('rate limiting fails closed when binding is absent or denies', async () => {
  const request = new Request('https://orders.example/orders', { method: 'POST' })
  await assert.rejects(enforceRateLimit(request, {}, 'uid-1'), /RATE_LIMITER_NOT_CONFIGURED/)
  await assert.rejects(enforceRateLimit(request, { RATE_LIMITER: { limit: async () => ({ success: false }) } }, 'uid-1'), /RATE_LIMITED/)
  await assert.doesNotReject(enforceRateLimit(request, { RATE_LIMITER: { limit: async ({ key }) => ({ success: key === 'uid-1:POST' }) } }, 'uid-1'))
})
