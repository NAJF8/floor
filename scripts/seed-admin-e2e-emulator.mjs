import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const email = process.env.VITE_E2E_ADMIN_EMAIL || 'admin-e2e@example.test'
const password = process.env.VITE_E2E_ADMIN_PASSWORD || 'LocalOnly-123456'
const fixtureId = 'admin-e2e-demo'

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to seed outside the local RTDB Emulator.')
if (process.env.VITE_USE_FIREBASE_EMULATORS !== 'true') throw new Error('Refusing to seed without VITE_USE_FIREBASE_EMULATORS=true.')

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${SHOP_ID}-default-rtdb` }, `admin-e2e-${Date.now()}`)
const database = getDatabase(app)

async function authRequest(endpoint, body) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/${endpoint}?key=local-emulator-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  const data = JSON.parse(text)
  if (!response.ok) throw new Error(`Auth Emulator ${endpoint} failed (${response.status}): ${text}`)
  return data
}

let user
try {
  user = await authRequest('accounts:signUp', { email, password, returnSecureToken: true })
} catch (error) {
  if (!String(error.message).includes('EMAIL_EXISTS')) throw error
  user = await authRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true })
}
await authRequest('accounts:update', { idToken: user.idToken, emailVerified: true, displayName: 'Synthetic E2E Admin', returnSecureToken: true })
await database.ref(`shopMemberships/${user.localId}/${SHOP_ID}`).set({ role: 'SUPER_ADMIN', active: true, permissions: { catalog: true, products: true, settings: true, orders: true, inventory: true, staff: true, audit: true } })
await database.ref(`admins/${user.localId}`).set({ shopId: SHOP_ID, role: 'SUPER_ADMIN', active: true, permissions: { gifting: true, giftingEdit: true, giftingPublish: true, catalog: true, products: true, settings: true, orders: true, inventory: true, staff: true, audit: true } })
await database.ref(`shops/${SHOP_ID}/products/${fixtureId}`).set({ id: fixtureId, name: 'Admin E2E Original', nameEn: 'Admin E2E Original', category: 'demo', price: 1111, image: 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=600&q=80', imageUrls: ['https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=600&q=80'], demoTag: 'ALASAS_DEMO_V1', status: 'DRAFT', active: false, orderable: false, stock: 1 })
await database.ref(`shops/${SHOP_ID}/public/demoProducts/${fixtureId}`).set({ id: fixtureId, name: 'Admin E2E Original', nameEn: 'Admin E2E Original', category: 'demo', price: 1111, image: 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=600&q=80', imageUrls: ['https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=600&q=80'], demoTag: 'ALASAS_DEMO_V1', status: 'DRAFT', active: false, orderable: false, order: 0 })
console.log(JSON.stringify({ uid: user.localId, email, password, fixtureId, emulatorOnly: true }))
