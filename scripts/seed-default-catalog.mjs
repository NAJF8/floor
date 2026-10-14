import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { DEMO_TAG, SHOP_ID, demoCategories, demoProducts } from './alasas-demo-data.mjs'

// Production is preview-only unless the operator explicitly passes --commit.
// The script only creates missing deterministic demo IDs; it never deletes or replaces existing records.
const commit = process.argv.includes('--commit')
const databaseUrl = `https://${SHOP_ID}-default-rtdb.europe-west1.firebasedatabase.app`
const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : undefined
if (!credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('No Admin credential configured. Preview requires a service account to read Production; no write was attempted.')

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: SHOP_ID, databaseURL, ...(credential ? { credential } : {}) })
const db = getDatabase(app)
const root = `shops/${SHOP_ID}`

try {
  const [categoriesSnapshot, productsSnapshot] = await Promise.all([
    db.ref(`${root}/public/categories`).get(),
    db.ref(`${root}/products`).get(),
  ])
  const existingCategories = categoriesSnapshot.val() || {}
  const existingProducts = productsSnapshot.val() || {}
  const categoryEntries = Object.entries(demoCategories).filter(([id]) => !existingCategories[id])
  const productEntries = Object.entries(demoProducts).filter(([id]) => !existingProducts[id])
  const updates = {}
  const now = Date.now()
  for (const [id, value] of categoryEntries) updates[`${root}/public/categories/${id}`] = { ...value, createdAt: now, updatedAt: now }
  for (const [id, value] of productEntries) updates[`${root}/products/${id}`] = { ...value, createdAt: now, updatedAt: now }

  console.log(JSON.stringify({
    mode: commit ? 'COMMIT_REQUESTED' : 'PREVIEW_ONLY',
    project: SHOP_ID,
    marker: DEMO_TAG,
    categoriesPrepared: Object.keys(demoCategories).length,
    productsPrepared: Object.keys(demoProducts).length,
    categoryAdds: categoryEntries.map(([id]) => `${root}/public/categories/${id}`),
    productAdds: productEntries.map(([id]) => `${root}/products/${id}`),
    existingCategories: Object.keys(existingCategories).length,
    existingProducts: Object.keys(existingProducts).length,
  }, null, 2))

  if (!commit) console.log('Preview only. No Firebase write was performed. Obtain explicit approval for this exact summary before rerunning with --commit.')
  else if (Object.keys(updates).length) {
    await db.ref().update(updates)
    console.log(`Committed ${categoryEntries.length} categories and ${productEntries.length} products without deleting existing records.`)
  } else console.log('Nothing to write; deterministic demo records already exist.')
} finally {
  // No cleanup or delete operation is performed by this Production script.
}
