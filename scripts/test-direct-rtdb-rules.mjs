import assert from 'node:assert/strict'
import { getApps, initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectDatabaseEmulator, equalTo, get, getDatabase, orderByChild, query, ref, runTransaction, set, update } from 'firebase/database'
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'

const projectId = 'floor-232bc'
const shopId = projectId
const databaseUrl = `http://127.0.0.1:9000?ns=${projectId}-default-rtdb`
const runId = Date.now().toString(36)
const adminApp = getAdminApps()[0] || initializeAdminApp({ projectId, databaseURL: databaseUrl })
const adminDb = getAdminDatabase(adminApp)
const adminAuth = getAdminAuth(adminApp)

const roles = {
  admin: { role: 'ADMIN', permissions: { products: true, catalog: true, settings: true, inventory: true } },
  manager: { role: 'MANAGER', permissions: { products: true, catalog: true, inventory: true } },
  employee: { role: 'EMPLOYEE', permissions: { products: false, catalog: false, inventory: true } },
  viewer: { role: 'VIEWER', permissions: { products: true, catalog: true, inventory: true } },
}

async function createIdentity(label) {
  const email = `${label}-${runId}@emulator.invalid`
  const user = await adminAuth.createUser({ email, password: 'StrongPass123!', emailVerified: true, displayName: label })
  return { ...user, email }
}

async function clientFor(identity) {
  const app = initializeApp({ apiKey: 'local', authDomain: 'localhost', databaseURL: databaseUrl, projectId }, `rules-${identity?.uid || 'anonymous'}-${Math.random()}`)
  const auth = getAuth(app)
  const db = getDatabase(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  if (identity) await signInWithEmailAndPassword(auth, identity.email, 'StrongPass123!')
  return { app, auth, db }
}

async function expectDenied(label, operation) {
  await assert.rejects(operation, error => {
    assert.match(String(error.code || error.message), /PERMISSION_DENIED|permission-denied|Permission denied/i, `${label}: unexpected error ${error.code || error.message}`)
    return true
  }, label)
}

async function expectAllowed(label, operation) {
  try { return await operation() } catch (error) { throw new Error(`${label}: expected allowed, got ${error.code || error.message}`) }
}

const identities = {}
for (const label of Object.keys(roles)) identities[label] = await createIdentity(label)
identities.unauthorized = await createIdentity('unauthorized')

const seed = {
  shopMemberships: Object.fromEntries(Object.entries(roles).map(([label, record]) => [identities[label].uid, { [shopId]: { ...record, active: true, email: identities[label].email } }])),
  shops: {
    [shopId]: {
      products: {
        published: { name: 'Seed published', category: 'flowers', price: 10000, status: 'PUBLISHED', active: true },
        hidden: { name: 'Seed hidden', category: 'flowers', price: 20000, status: 'HIDDEN', active: true },
      },
      public: {
        categories: {
          published: { name: 'Published category', status: 'PUBLISHED', visible: true, order: 1 },
          hidden: { name: 'Hidden category', status: 'HIDDEN', visible: false, order: 2 },
        },
        delivery: { Najaf: { University: { price: 5000, enabled: true } } },
        paymentMethods: { cash: { name: 'Cash', type: 'CASH', enabled: true } },
        settings: { acceptingOrders: true },
      },
      private: { inventory: { ribbon: { name: 'Ribbon', quantity: 10, reorderLevel: 2, costPrice: 1000, active: true, status: 'ACTIVE' } }, orders: { secret: { total: 1 } } },
    },
  },
}
await adminDb.ref('/').set(seed)

const anonymous = await clientFor(null)
const admin = await clientFor(identities.admin)
const manager = await clientFor(identities.manager)
const employee = await clientFor(identities.employee)
const viewer = await clientFor(identities.viewer)
const unauthorized = await clientFor(identities.unauthorized)

const productsRef = `shops/${shopId}/products`
const categoriesRef = `shops/${shopId}/public/categories`
const inventoryRef = `shops/${shopId}/private/inventory`

const publishedQuery = query(ref(anonymous.db, productsRef), orderByChild('status'), equalTo('PUBLISHED'))
const customerProducts = await expectAllowed('customer reads published products', () => get(publishedQuery))
assert.deepEqual(Object.keys(customerProducts.val()), ['published'])
await expectDenied('customer cannot read all products', () => get(ref(anonymous.db, productsRef)))
const customerCategories = await expectAllowed('customer reads published categories', () => get(query(ref(anonymous.db, categoriesRef), orderByChild('status'), equalTo('PUBLISHED'))))
assert.deepEqual(Object.keys(customerCategories.val()), ['published'])
await expectDenied('customer cannot read private orders', () => get(ref(anonymous.db, `shops/${shopId}/private/orders`)))

await expectAllowed('admin reads products', () => get(ref(admin.db, productsRef)))
await expectAllowed('viewer reads products', () => get(ref(viewer.db, productsRef)))
await expectDenied('unauthorized cannot read products', () => get(ref(unauthorized.db, productsRef)))
await expectDenied('viewer cannot write products', () => update(ref(viewer.db, `${productsRef}/published`), { price: 11000 }))
await expectDenied('employee cannot write products', () => update(ref(employee.db, `${productsRef}/published`), { price: 11000 }))
await expectDenied('unauthorized cannot write products', () => update(ref(unauthorized.db, `${productsRef}/published`), { price: 11000 }))

await expectAllowed('manager creates category', () => set(ref(manager.db, `${categoriesRef}/managed`), { name: 'Managed category', status: 'PUBLISHED', visible: true, order: 3 }))
await expectAllowed('manager creates product', () => set(ref(manager.db, `${productsRef}/managed`), { name: 'Managed flower', category: 'managed', price: 30000, status: 'PUBLISHED', active: true }))
await expectAllowed('manager updates price', () => update(ref(manager.db, `${productsRef}/managed`), { price: 35000 }))
await expectDenied('invalid negative price denied', () => update(ref(manager.db, `${productsRef}/managed`), { price: -1 }))
await expectAllowed('manager hides product', () => update(ref(manager.db, `${productsRef}/managed`), { status: 'HIDDEN', active: false }))
const hiddenAfter = await get(query(ref(anonymous.db, productsRef), orderByChild('status'), equalTo('PUBLISHED')))
assert.equal(hiddenAfter.hasChild('managed'), false)
await expectDenied('unauthorized cannot delete product', () => set(ref(unauthorized.db, `${productsRef}/published`), null))

await expectAllowed('viewer reads inventory', () => get(ref(viewer.db, inventoryRef)))
await expectDenied('viewer cannot write inventory', () => update(ref(viewer.db, `${inventoryRef}/ribbon`), { quantity: 9 }))
const before = (await get(ref(manager.db, `${inventoryRef}/ribbon/quantity`))).val()
await Promise.all([1, 2].map(() => runTransaction(ref(manager.db, `${inventoryRef}/ribbon/quantity`), current => Number(current || 0) + 1)))
const after = (await get(ref(manager.db, `${inventoryRef}/ribbon/quantity`))).val()
assert.equal(after, before + 2)
await expectDenied('membership self-write denied', () => set(ref(admin.db, `shopMemberships/${identities.admin.uid}/${shopId}/role`), 'SUPER_ADMIN'))
await expectDenied('private order direct read denied', () => get(ref(manager.db, `shops/${shopId}/private/orders`)))

for (const client of [anonymous, admin, manager, employee, viewer, unauthorized]) {
  await signOut(client.auth).catch(() => undefined)
  await deleteApp(client.app)
}
console.log('DIRECT_RTDB_RULES_TESTS_PASS')
