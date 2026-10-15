import test from 'node:test'
import assert from 'node:assert/strict'
import { createRtdbAdapter, createServiceAccountTokenProvider } from './rtdb-adapter.js'

async function testPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  let binary = ''
  for (const byte of der) binary += String.fromCharCode(byte)
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`
}

test('SERVICE_ACCOUNT_AUTH rejects missing server-only credentials', async () => {
  const token = createServiceAccountTokenProvider({ env: {}, fetchImpl: async () => { throw new Error('must not fetch') } })
  await assert.rejects(token, error => error.code === 'SERVICE_ACCOUNT_NOT_CONFIGURED')
})

test('ACCESS_TOKEN_REFRESH caches valid token and refreshes after expiry', async () => {
  let now = 1700000000000
  let calls = 0
  const token = createServiceAccountTokenProvider({ env: { FIREBASE_SERVICE_ACCOUNT_EMAIL: 'worker@example.iam.gserviceaccount.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: await testPrivateKey() }, now: () => now, fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ access_token: `token-${calls}`, expires_in: 120 }), { status: 200 }) } })
  assert.equal(await token(), 'token-1')
  assert.equal(await token(), 'token-1')
  now += 70000
  assert.equal(await token(), 'token-2')
  assert.equal(calls, 2)
})

test('RTDB_READ and RTDB_WRITE use Bearer token and bounded REST requests', async () => {
  const requests = []
  const adapter = createRtdbAdapter({ env: { FIREBASE_DATABASE_URL: 'https://database.example', FIREBASE_SHOP_ID: 'floor-232bc' }, getAccessToken: async () => 'emulator-fixture-token', fetchImpl: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ ok: true }), { status: 200 }) } })
  assert.deepEqual(await adapter.read('shops/floor-232bc/public/demoProducts'), { ok: true })
  assert.deepEqual(await adapter.write('emulator/order-fixture', { ok: true }), { ok: true })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].options.headers.authorization, 'Bearer emulator-fixture-token')
  assert.equal(requests[1].options.method, 'PUT')
})

test('RTDB order writes refuse unsafe non-atomic fallback', async () => {
  const adapter = createRtdbAdapter({ env: { FIREBASE_DATABASE_URL: 'https://database.example' }, getAccessToken: async () => 'fixture' })
  await assert.rejects(adapter.writeOrderAtomically(), error => error.code === 'ATOMIC_STOCK_COORDINATOR_REQUIRED')
})
