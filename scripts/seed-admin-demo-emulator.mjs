import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { DEMO_TAG, SHOP_ID, demoCategories, demoInventory, demoProducts } from './alasas-demo-data.mjs'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to seed: FIREBASE_DATABASE_EMULATOR_HOST must point to a local emulator.')
const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `alasas-demo-${Date.now()}`)
const db = getDatabase(app)
const cleanup = process.argv.includes('--cleanup')
const root = `shops/${SHOP_ID}`

try {
  const updates = {}
  if (cleanup) {
    const snapshots = await Promise.all([db.ref(`${root}/public/categories`).get(), db.ref(`${root}/products`).get(), db.ref(`${root}/private/inventory`).get()])
    for (const [id, value] of Object.entries(snapshots[0].val() || {})) if (value?.demoTag === DEMO_TAG) updates[`${root}/public/categories/${id}`] = null
    for (const [id, value] of Object.entries(snapshots[1].val() || {})) if (value?.demoTag === DEMO_TAG) updates[`${root}/products/${id}`] = null
    for (const [id, value] of Object.entries(snapshots[2].val() || {})) if (value?.demoTag === DEMO_TAG) updates[`${root}/private/inventory/${id}`] = null
  } else {
    const now = Date.now()
    for (const [id, value] of Object.entries(demoCategories)) updates[`${root}/public/categories/${id}`] = { ...value, createdAt: now, updatedAt: now }
    for (const [id, value] of Object.entries(demoProducts)) updates[`${root}/products/${id}`] = { ...value, createdAt: now, updatedAt: now }
    for (const [id, value] of Object.entries(demoInventory)) updates[`${root}/private/inventory/${id}`] = { ...value, createdAt: now, updatedAt: now }
  }
  await db.ref().update(updates)
  console.log(JSON.stringify({ mode: cleanup ? 'CLEANUP' : 'SEED', emulator: true, demoTag: DEMO_TAG, changed: Object.keys(updates).length }, null, 2))
} finally {
  await deleteApp(app)
}
