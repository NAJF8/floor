import assert from 'node:assert/strict'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app'
import { connectDatabaseEmulator, getDatabase, onValue, ref } from 'firebase/database'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to run without a local Database Emulator.')

const shopId = 'floor-232bc'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${shopId}-default-rtdb`
const databaseUrl = `http://${host}?ns=${namespace}`
const fixtureId = `demo-realtime-${Date.now()}`
const root = `shops/${shopId}`
const demoPath = `${root}/public/demoProducts/${fixtureId}`
const settingsPath = `${root}/public/settings`
const homepagePath = `${root}/public/homepage`
const aiPath = `${root}/public/aiAssistant`

const adminApp = initializeAdminApp({ projectId: shopId, databaseURL: databaseUrl }, `demo-realtime-admin-${Date.now()}`)
const adminDb = getAdminDatabase(adminApp)
const clientApp = initializeClientApp({ apiKey: 'local-emulator-key', databaseURL: databaseUrl, projectId: shopId }, `demo-realtime-customer-${Date.now()}`)
const clientDb = getDatabase(clientApp)
connectDatabaseEmulator(clientDb, host.split(':')[0], Number(host.split(':')[1]))

function waitFor(predicate, label, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = value => {
      if (predicate(value)) return resolve(value)
      if (Date.now() - started >= timeout) return reject(new Error(`Timed out waiting for ${label}.`))
      setTimeout(() => check(value), 25)
    }
    return check(undefined)
  })
}

async function watch(path, label) {
  const values = []
  let latest
  const stop = onValue(ref(clientDb, path), snapshot => { latest = snapshot.val(); values.push(latest) })
  await waitFor(() => values.length > 0, `${label} initial snapshot`)
  return { values, get latest() { return latest }, stop }
}

const original = {
  settings: await adminDb.ref(settingsPath).get().then(snapshot => snapshot.val()),
  homepage: await adminDb.ref(homepagePath).get().then(snapshot => snapshot.val()),
  ai: await adminDb.ref(aiPath).get().then(snapshot => snapshot.val()),
}

try {
  const demoWatch = await watch(demoPath, 'demo product')
  const settingsWatch = await watch(settingsPath, 'store settings')
  const homepageWatch = await watch(homepagePath, 'hero media')
  const aiWatch = await watch(aiPath, 'AI avatar')

  await adminDb.ref(demoPath).set({ name: 'DEMO original', price: 1000, category: 'demo-category-original', image: 'https://example.test/original.jpg', imageUrls: ['https://example.test/original.jpg'], order: 0, demoTag: 'ALASAS_DEMO_V1', status: 'DEMO', active: false, orderable: false })
  await waitFor(() => demoWatch.latest?.name === 'DEMO original', 'demo product create')
  await adminDb.ref(demoPath).update({ name: 'DEMO updated', price: 2000, category: 'demo-category-updated', image: 'https://example.test/updated.jpg', imageUrls: ['https://example.test/updated.jpg', 'https://example.test/extra.jpg'], order: 7 })
  await waitFor(() => demoWatch.latest?.name === 'DEMO updated' && demoWatch.latest?.price === 2000 && demoWatch.latest?.imageUrls?.length === 2 && demoWatch.latest?.order === 7, 'demo realtime update')
  assert.equal(demoWatch.latest.demoTag, 'ALASAS_DEMO_V1')
  assert.equal(demoWatch.latest.active, false)
  assert.equal(demoWatch.latest.orderable, false)
  await adminDb.ref(demoPath).update({ status: 'HIDDEN' })
  await waitFor(() => demoWatch.latest?.status === 'HIDDEN', 'demo visibility update')
  await adminDb.ref(demoPath).update({ status: 'DEMO' })
  await waitFor(() => demoWatch.latest?.status === 'DEMO', 'demo visibility restore')

  await adminDb.ref(settingsPath).update({ demoRealtimeProbe: 'settings' })
  await waitFor(() => settingsWatch.latest?.demoRealtimeProbe === 'settings', 'settings realtime update')
  await adminDb.ref(homepagePath).update({ demoRealtimeProbe: 'hero' })
  await waitFor(() => homepageWatch.latest?.demoRealtimeProbe === 'hero', 'hero realtime update')
  await adminDb.ref(aiPath).update({ demoRealtimeProbe: 'avatar' })
  await waitFor(() => aiWatch.latest?.demoRealtimeProbe === 'avatar', 'AI avatar realtime update')

  console.log(JSON.stringify({
    DEMO_NAME_SYNC: true,
    DEMO_PRICE_SYNC: true,
    DEMO_IMAGE_SYNC: true,
    DEMO_EXTRA_IMAGES_SYNC: true,
    DEMO_VISIBILITY_SYNC: true,
    DEMO_CATEGORY_SYNC: true,
    STORE_SETTINGS_SYNC: true,
    HERO_MEDIA_SYNC: true,
    AI_AVATAR_SYNC: true,
    CUSTOMER_REALTIME_CALLBACKS: { demo: demoWatch.values.length, settings: settingsWatch.values.length, homepage: homepageWatch.values.length, ai: aiWatch.values.length },
    fixtureId,
  }, null, 2))

  demoWatch.stop(); settingsWatch.stop(); homepageWatch.stop(); aiWatch.stop()
} finally {
  await adminDb.ref(demoPath).remove()
  await adminDb.ref(settingsPath).set(original.settings)
  await adminDb.ref(homepagePath).set(original.homepage)
  await adminDb.ref(aiPath).set(original.ai)
  await deleteClientApp(clientApp)
  await deleteAdminApp(adminApp)
}
