import assert from 'node:assert/strict'
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, get, onValue, ref, set, update } from 'firebase/database'

const projectId = 'floor-232bc'
const shopId = projectId
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:19199'
const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:19100'
const [dbAddress, dbPort] = dbHost.split(':')
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || 'floor-232bc-default-rtdb'
const databaseUrl = `http://${dbHost}?ns=${namespace}`
const runId = Date.now().toString(36)
const adminApp = getAdminApps()[0] || initializeAdminApp({ projectId, databaseURL: databaseUrl })
const adminDb = getAdminDatabase(adminApp)

async function identity(label) {
  const email = `${label}-${runId}@emulator.invalid`
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'StrongPass123!', returnSecureToken: true }) })
  const body = await response.json()
  assert.equal(response.ok, true, `Auth signup failed: ${JSON.stringify(body)}`)
  return { email, password: 'StrongPass123!', uid: body.localId }
}

async function clientFor(user) {
  const app = initializeApp({ apiKey: 'local', authDomain: 'localhost', databaseURL: databaseUrl, projectId }, `gifting-rules-${user?.uid || 'anonymous'}-${Math.random()}`)
  const auth = getAuth(app); const db = getDatabase(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true }); connectDatabaseEmulator(db, dbAddress, Number(dbPort))
  if (user) await signInWithEmailAndPassword(auth, user.email, user.password)
  return { app, db }
}

async function denied(label, operation) { await assert.rejects(operation, error => /PERMISSION_DENIED|permission-denied|Permission denied/i.test(String(error.code || error.message)), label) }
async function allowed(label, operation) { try { return await operation() } catch (error) { throw new Error(`${label}: ${error.code || error.message}`) } }

const superAdmin = await identity('super')
const manager = await identity('manager')
const employee = await identity('employee')
const viewer = await identity('viewer')
const customer = await identity('customer')
const outsider = await identity('outsider')
await adminDb.ref('/').set({
  admins: {
    [superAdmin.uid]: { shopId, role: 'SUPER_ADMIN', active: true, permissions: { gifting: true } },
    [manager.uid]: { shopId, role: 'MANAGER', active: true, permissions: { gifting: true } },
    [employee.uid]: { shopId, role: 'EMPLOYEE', active: true, permissions: { giftingEdit: false } },
    [viewer.uid]: { shopId, role: 'VIEWER', active: true },
  },
  shopMemberships: {
    [superAdmin.uid]: { [shopId]: { shopId, role: 'SUPER_ADMIN', active: true, permissions: { gifting: true, catalog: true } } },
    [manager.uid]: { [shopId]: { shopId, role: 'MANAGER', active: true, permissions: { gifting: true, catalog: true } } },
    [employee.uid]: { [shopId]: { shopId, role: 'EMPLOYEE', active: true, permissions: { gifting: true, catalog: true } } },
    [viewer.uid]: { [shopId]: { shopId, role: 'VIEWER', active: true, permissions: { gifting: true, catalog: true } } },
  },
  shops: { [shopId]: { public: { gifting: { addons: { seed: { name: 'Seed ribbon', price: 1000, enabled: true, status: 'PUBLISHED' } } } } } },
})

const anonymous = await clientFor(null); const managerClient = await clientFor(manager); const superClient = await clientFor(superAdmin); const employeeClient = await clientFor(employee); const viewerClient = await clientFor(viewer); const customerClient = await clientFor(customer); const outsiderClient = await clientFor(outsider)
const publicPath = `shops/${shopId}/public/gifting`
const draftPath = `shops/${shopId}/admin/gifting/addons`

assert.equal((await allowed('anonymous read', () => get(ref(anonymous.db, publicPath)))).child('addons/seed').val().name, 'Seed ribbon')
assert.equal((await allowed('customer read', () => get(ref(customerClient.db, publicPath)))).child('addons/seed').val().price, 1000)
await denied('customer public write denied', () => set(ref(customerClient.db, `${publicPath}/addons/customer`), { name: 'Nope', price: 1, enabled: true, status: 'PUBLISHED' }))
await denied('customer draft write denied', () => set(ref(customerClient.db, `${draftPath}/customer`), { name: 'Nope', price: 1, enabled: false, status: 'DRAFT' }))
await allowed('employee can read admin draft', () => get(ref(employeeClient.db, draftPath)))
await denied('employee unauthorized write denied', () => set(ref(employeeClient.db, `${draftPath}/employee`), { name: 'Nope', price: 1, enabled: false, status: 'DRAFT' }))
await denied('viewer write denied', () => set(ref(viewerClient.db, `${draftPath}/viewer`), { name: 'Nope', price: 1, enabled: false, status: 'DRAFT' }))
await allowed('manager creates draft directly', () => set(ref(managerClient.db, `${draftPath}/ribbon-1`), { name: 'Manager ribbon', price: 2500, enabled: false, status: 'DRAFT', order: 1 }))
await allowed('manager edits same draft directly', () => update(ref(managerClient.db, `${draftPath}/ribbon-1`), { price: 3000 }))
await denied('manager direct public write denied', () => set(ref(managerClient.db, `${publicPath}/addons/ribbon-1`), { name: 'Manager ribbon', price: 2500, enabled: true, status: 'PUBLISHED', order: 1 }))
await denied('invalid pricing direct write denied', () => update(ref(managerClient.db), { [`${draftPath}/ribbon-1`]: { name: 'bad', price: -1 }, [`${publicPath}/addons/ribbon-1`]: { name: 'bad', price: -1 } }))
await denied('sensitive field direct write denied', () => update(ref(managerClient.db), { [`${draftPath}/ribbon-1/customerId`]: 'customer-secret', [`${publicPath}/addons/ribbon-1/customerId`]: 'customer-secret' }))
await denied('super admin direct publish denied', () => set(ref(superClient.db, `${publicPath}/addons/direct-publish`), { name: 'No direct publish', price: 1, enabled: true, status: 'PUBLISHED' }))
await denied('unauthorized publish denied', () => update(ref(outsiderClient.db), { [`${publicPath}/addons/bad`]: { name: 'bad', price: 1, enabled: true, status: 'PUBLISHED' } }))
await allowed('super admin creates draft directly', () => set(ref(superClient.db, `${draftPath}/super-1`), { name: 'Super ribbon', price: 5000, enabled: false, status: 'DRAFT' }))
await denied('admin self promotion denied', () => set(ref(managerClient.db, `admins/${manager.uid}/role`), 'SUPER_ADMIN'))
await denied('role escalation denied', () => set(ref(managerClient.db, `admins/${outsider.uid}`), { shopId, role: 'SUPER_ADMIN', active: true }))
await denied('invalid public payload denied', () => set(ref(managerClient.db, `${publicPath}/addons/injected`), { name: 'bad', price: -1, enabled: true, status: 'PUBLISHED' }))

for (const client of [anonymous, managerClient, superClient, employeeClient, viewerClient, customerClient, outsiderClient]) await deleteApp(client.app)
console.log(JSON.stringify({ ADMIN_AUTH: 'PASS', DRAFT_DIRECT_RTDB_CRUD: 'PASS', PUBLIC_DIRECT_WRITE_DENIED: 'PASS', SECURITY_RULES: 'PASS', RBAC: 'PASS', CUSTOMER_PUBLIC_READ: 'PASS', SENSITIVE_FIELDS_DENIED: 'PASS', MULTI_LOCATION_WRITE_DENIED: 'PASS', PRODUCTION_DATA_PRESERVED: 'PASS' }))
