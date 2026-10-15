import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGiftingRequest } from './gifting-api.js'

const env = { ALLOWED_ORIGINS: 'https://najf8.github.io', FIREBASE_DATABASE_URL: 'https://database.example', FIREBASE_PROJECT_ID: 'floor-232bc' }
const identity = { uid: 'admin-1', claims: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } }

function request(body, origin = 'https://najf8.github.io') {
  return new Request('https://worker.example/api/admin/gifting', { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

test('gifting backend denies disallowed origins before authentication', async () => {
  const response = await handleGiftingRequest(request({ operation: 'create', path: 'shops/floor-232bc/public/gifting/addons', value: {} }, 'https://evil.example'), env, { verifyToken: async () => { throw new Error('must not authenticate') } })
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error, 'origin_not_allowed')
})

test('gifting backend enforces membership and writes a sanitized record with audit', async () => {
  const writes = []
  const adapter = {
    async read(path) { if (path.startsWith('shopMemberships/')) return { active: true, role: 'MANAGER', permissions: { catalog: true } }; return { name: 'Ribbon', price: 5000, enabled: true } },
    async write(path, value) { writes.push({ path, value }); return value },
  }
  const response = await handleGiftingRequest(request({ operation: 'create', path: 'shops/floor-232bc/public/gifting/addons', value: { name: 'Ribbon', price: 5000, privateCustomerData: 'must-drop' } }), env, { verifyToken: async () => identity, adapter })
  assert.equal(response.status, 200)
  assert.equal(writes.length, 2)
  assert.match(writes[0].path, /^shops\/floor-232bc\/public\/gifting\/addons\/[A-Za-z0-9_-]+$/)
  assert.deepEqual(writes[0].value, { name: 'Ribbon', price: 5000 })
  assert.equal(writes[1].value.action, 'GIFTING_CREATE')
})

test('gifting backend rejects employee role and invalid values', async () => {
  const adapter = { async read() { return { active: true, role: 'EMPLOYEE', permissions: { catalog: true } } }, async write() { throw new Error('must not write') } }
  const denied = await handleGiftingRequest(request({ operation: 'create', path: 'shops/floor-232bc/public/gifting/cards', value: { text: 'x' } }), env, { verifyToken: async () => identity, adapter })
  assert.equal(denied.status, 403)
  const managerAdapter = { async read(path) { return path.startsWith('shopMemberships/') ? { active: true, role: 'MANAGER' } : { text: 'x' } }, async write() { throw new Error('must not write') } }
  const invalid = await handleGiftingRequest(request({ operation: 'create', path: 'shops/floor-232bc/public/gifting/cards', value: { text: 'x', price: -1 } }), env, { verifyToken: async () => identity, adapter: managerAdapter })
  assert.equal(invalid.status, 400)
})
