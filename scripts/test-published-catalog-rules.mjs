import { getApps, initializeApp, deleteApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
  throw new Error('Refusing to run: FIREBASE_DATABASE_EMULATOR_HOST must point to a local emulator.')
}

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `catalog-rules-smoke-${Date.now()}`)
const database = getDatabase(app)
const path = `shops/${SHOP_ID}/products`
const endpoint = `http://${host}/${path}.json?ns=${encodeURIComponent(namespace)}`

try {
  await database.ref(path).set({
    draft: { name: 'Synthetic draft', price: 1, category: 'test', status: 'DRAFT', active: false },
    published: { name: 'Synthetic published', price: 2, category: 'test', status: 'PUBLISHED', active: true },
  })

  const unfiltered = await fetch(endpoint)
  const filtered = await fetch(`${endpoint}&orderBy=${encodeURIComponent('"status"')}&equalTo=${encodeURIComponent('"PUBLISHED"')}`)
  const filteredText = await filtered.text()
  let filteredBody = null
  try { filteredBody = JSON.parse(filteredText) } catch { /* include raw response in the failure below */ }

  if (unfiltered.status !== 401) throw new Error(`Expected unfiltered public read 401, received ${unfiltered.status}.`)
  if (filtered.status !== 200) throw new Error(`Expected published query 200, received ${filtered.status}: ${filteredText}`)
  if (!filteredBody?.published || filteredBody?.draft) throw new Error('Published query returned an unexpected catalog shape.')

  console.log(JSON.stringify({ unfilteredStatus: unfiltered.status, publishedQueryStatus: filtered.status, returnedKeys: Object.keys(filteredBody) }, null, 2))
} finally {
  await database.ref(path).remove()
  await deleteApp(app)
}
