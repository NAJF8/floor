import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { DEMO_TAG, SHOP_ID } from './alasas-demo-data.mjs'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to test without a local Database Emulator.')
const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `alasas-demo-test-${Date.now()}`)
const db = getDatabase(app)
const root = `shops/${SHOP_ID}`
const fixtureId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const categoryId = `${fixtureId}-category`
const productId = `${fixtureId}-product`
const categoryPath = `${root}/public/categories/${categoryId}`
const productPath = `${root}/products/${productId}`

try {
  await db.ref(categoryPath).set({ name: 'قسم اختبار DEMO', status: 'DRAFT', visible: false, demoTag: DEMO_TAG })
  await db.ref(productPath).set({ name: 'منتج اختبار DEMO', category: categoryId, price: 10000, status: 'DRAFT', active: false, demoTag: DEMO_TAG })
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
  const [categoryReadback, productReadback] = await Promise.all([db.ref(categoryPath).get(), db.ref(productPath).get()])
  assert.equal(categoryReadback.val().demoTag, DEMO_TAG)
  assert.equal(productReadback.val().demoTag, DEMO_TAG)
  console.log(JSON.stringify({ DEMO_CRUD_PASS: true, categoryCreate: true, categoryArchive: true, productCreate: true, productUpdate: true, productHideRepublish: true, uniqueFixtureId: fixtureId, cleanup: 'finally' }, null, 2))
} finally {
  await db.ref(categoryPath).remove()
  await db.ref(productPath).remove()
  await deleteApp(app)
}
