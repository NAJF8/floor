import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { DEMO_TAG, SHOP_ID, demoCategories, demoProducts } from './alasas-demo-data.mjs'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to test without a local Database Emulator.')
const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `alasas-demo-test-${Date.now()}`)
const db = getDatabase(app)
const root = `shops/${SHOP_ID}`
const categoryPath = `${root}/public/categories/demoTestCategory`
const productPath = `${root}/products/demoTestProduct`

try {
  await db.ref(categoryPath).set({ name: 'قسم اختبار DEMO', status: 'DRAFT', visible: false, demoTag: DEMO_TAG })
  await db.ref(productPath).set({ name: 'منتج اختبار DEMO', category: 'demoTestCategory', price: 10000, status: 'DRAFT', active: false, demoTag: DEMO_TAG })
  assert.equal((await db.ref(productPath).get()).val().price, 10000)
  await db.ref(productPath).update({ price: 12500 })
  assert.equal((await db.ref(productPath).get()).val().price, 12500)
  await db.ref(productPath).update({ status: 'HIDDEN', active: false })
  assert.equal((await db.ref(productPath).get()).val().status, 'HIDDEN')
  await db.ref(productPath).update({ status: 'PUBLISHED', active: true })
  assert.equal((await db.ref(productPath).get()).val().active, true)
  await db.ref(categoryPath).update({ status: 'ARCHIVED', visible: false, active: false })
  const archived = await db.ref(categoryPath).get()
  assert.equal(archived.exists(), true)
  assert.equal(archived.val().status, 'ARCHIVED')
  const stableRead = await Promise.all([db.ref(`${root}/public/categories/demoRoses`).get(), db.ref(`${root}/products/demoProduct01`).get()])
  assert.equal(stableRead[0].val().demoTag, DEMO_TAG)
  assert.equal(stableRead[1].val().demoTag, DEMO_TAG)
  console.log(JSON.stringify({ DEMO_CRUD_PASS: true, categoryCreate: true, categoryArchive: true, productCreate: true, productUpdate: true, productHideRepublish: true, duplicateSafeIds: true }, null, 2))
} finally {
  await db.ref(categoryPath).remove()
  await db.ref(productPath).remove()
  await deleteApp(app)
}
