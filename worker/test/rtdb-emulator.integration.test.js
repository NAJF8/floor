import test from 'node:test'
import assert from 'node:assert/strict'
import { createRtdbAdapter } from '../src/rtdb-adapter.js'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const env = { FIREBASE_DATABASE_URL: `http://${host}`, FIREBASE_DATABASE_EMULATOR: 'true', FIREBASE_DATABASE_EMULATOR_NAMESPACE: 'floor-232bc-default-rtdb', FIREBASE_SHOP_ID: 'floor-232bc' }

async function createFixtureUser() {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `fixture-${Date.now()}@example.test`, password: 'password123', returnSecureToken: true }) })
  assert.equal(response.ok, true)
  const body = await response.json()
  assert.equal(typeof body.idToken, 'string')
  return body.idToken
}

test('EMULATOR_INTEGRATION: Auth Emulator issues an isolated fixture token', async () => {
  await createFixtureUser()
})

test('RTDB_READ and RTDB_WRITE use the isolated Emulator adapter', async () => {
  const adapter = createRtdbAdapter({ env, getAccessToken: async () => 'emulator-server-fixture' })
  const path = `shops/${env.FIREBASE_SHOP_ID}/public/fixture`
  await adapter.write(path, { marker: 'PHASE_3_1_FIXTURE' })
  assert.deepEqual(await adapter.read(path), { marker: 'PHASE_3_1_FIXTURE' })
})

test('DIRECT_WRITE_BLOCKED: customer ID token cannot write private orders', async () => {
  const idToken = await createFixtureUser()
  const response = await fetch(`http://${host}/shops/${env.FIREBASE_SHOP_ID}/private/orders/customer-direct.json?ns=${encodeURIComponent(env.FIREBASE_DATABASE_EMULATOR_NAMESPACE)}&auth=${encodeURIComponent(idToken)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ total: 1 }) })
  assert.equal(response.status, 401)
})
