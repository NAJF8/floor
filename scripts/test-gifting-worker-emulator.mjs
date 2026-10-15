import assert from 'node:assert/strict'
import { initializeApp as initializeAdminApp, getApps as getAdminApps, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectDatabaseEmulator, getDatabase, onValue, ref, set } from 'firebase/database'
import { handleGiftingRequest } from '../worker/src/gifting-api.js'
import { createRtdbAdapter } from '../worker/src/rtdb-adapter.js'

const projectId = 'floor-232bc'
const shopId = projectId
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${shopId}-default-rtdb`
const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:19000'
const runId = Date.now().toString(36)
const env = { ALLOWED_ORIGINS: 'http://localhost:5173', FIREBASE_DATABASE_URL: `http://${dbHost}`, FIREBASE_DATABASE_EMULATOR: 'true', FIREBASE_DATABASE_EMULATOR_NAMESPACE: namespace, FIREBASE_PROJECT_ID: projectId }
const adminApp = getAdminApps()[0] || initializeAdminApp({ projectId, databaseURL: `http://${dbHost}?ns=${namespace}` })
const adminDb = getAdminDatabase(adminApp)
const adapter = createRtdbAdapter({ env, getAccessToken: async () => 'emulator-server-fixture' })
const request = (body) => new Request('http://worker.local/api/admin/gifting', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify(body) })
const identity = (uid) => ({ uid, claims: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } })
const call = (uid, membership, body) => handleGiftingRequest(request(body), env, { verifyToken: async () => identity(uid), adapter: { read: async (path) => path.startsWith('shopMemberships/') ? membership : adapter.read(path), write: (path, value) => adapter.write(path, value) } })

await adminDb.ref(`shops/${shopId}/public/gifting`).set({ addons: {}, cards: {}, occasions: {}, flowerTypes: {}, flowerColors: {}, stemCounts: {}, wrappings: {}, wrappingColors: {}, ribbons: {}, settings: { maxCardMessageLength: 300 } })
const anonymousApp = initializeApp({ apiKey: 'local', projectId, databaseURL: `http://${dbHost}?ns=${namespace}` }, `gifting-worker-${runId}`)
const anonymousDb = getDatabase(anonymousApp); connectDatabaseEmulator(anonymousDb, '127.0.0.1', 19000)
try {
  assert.equal((await handleGiftingRequest(new Request('http://worker.local/api/admin/gifting', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: '{}' }), env)).status, 401)
  assert.equal((await call(`${runId}-employee`, { active: true, role: 'EMPLOYEE', permissions: { catalog: true } }, { operation: 'create', path: `shops/${shopId}/public/gifting/addons`, value: { name: 'blocked', price: 1 } })).status, 403)
  const manager = await call(`${runId}-manager`, { active: true, role: 'MANAGER', permissions: { catalog: true } }, { operation: 'create', path: `shops/${shopId}/public/gifting/addons`, value: { name: 'Synthetic ribbon', price: 1000, enabled: true } })
  assert.equal(manager.status, 200)
  const key = (await manager.json()).key
  const path = `shops/${shopId}/public/gifting/addons/${key}`
  assert.equal((await call(`${runId}-admin`, { active: true, role: 'ADMIN', permissions: { catalog: true } }, { operation: 'update', path, value: { price: 1200 } })).status, 200)
  assert.equal((await call(`${runId}-super`, { active: true, role: 'SUPER_ADMIN' }, { operation: 'publish', path })).status, 200)
  assert.equal((await call(`${runId}-super`, { active: true, role: 'SUPER_ADMIN' }, { operation: 'hide', path })).status, 200)
  const readback = (await adminDb.ref(path).get()).val()
  assert.deepEqual(readback, { name: 'Synthetic ribbon', price: 1200, enabled: false, status: 'HIDDEN' })
  let live = false
  const stop = onValue(ref(anonymousDb, `shops/${shopId}/public/gifting`), snapshot => { if (snapshot.child(`addons/${key}/status`).val() === 'HIDDEN') live = true })
  await new Promise(resolve => setTimeout(resolve, 400))
  stop(); assert.equal(live, true)
  let directDenied = false
  try { await set(ref(anonymousDb, path), { name: 'bypass', price: 1 }) } catch { directDenied = true }
  assert.equal(directDenied, true)
  console.log(JSON.stringify({ ANONYMOUS_REJECTION: 'PASS', EMPLOYEE_REJECTION: 'PASS', MANAGER_CREATE: 'PASS', ADMIN_UPDATE: 'PASS', SUPER_ADMIN_PUBLISH_HIDE: 'PASS', FIREBASE_READBACK: 'PASS', CUSTOMER_REALTIME: 'PASS', DIRECT_WRITE_DENIED: 'PASS' }))
} finally {
  await adminDb.ref(`shops/${shopId}/public/gifting`).remove()
  await deleteApp(anonymousApp)
  await deleteAdminApp(adminApp)
}
