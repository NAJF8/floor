import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const PROJECT_ID = 'floor-232bc'
const SHOP_ID = 'floor-232bc'
const APPROVED_EMAILS = new Set(['mohameadalhaear100@gmail.com', 'alasastech0@gmail.com'])
const [firstUid, secondUid, ...flags] = process.argv.slice(2)
const commit = flags.includes('--commit')
if (!firstUid || !secondUid || flags.some((flag) => flag !== '--commit')) {
  console.error('Usage: npm run provision:super-admins -- <uid-1> <uid-2> [--commit]')
  process.exit(2)
}

function initAdmin() {
  if (getApps().length) return getApps()[0]
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const credential = raw ? cert(JSON.parse(raw)) : undefined
  return initializeApp({ projectId: PROJECT_ID, credential, databaseURL: 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app' })
}

const app = initAdmin(); const auth = getAuth(app); const db = getDatabase(app)
const users = await Promise.all([firstUid, secondUid].map((uid) => auth.getUser(uid)))
const emails = users.map((user) => user.email?.toLowerCase())
if (new Set(emails).size !== 2 || emails.some((email) => !email || !APPROVED_EMAILS.has(email))) throw new Error('UIDs must resolve to the two exact approved emails.')
if (users.some((user) => !user.emailVerified || !user.providerData.some((provider) => provider.providerId === 'google.com'))) throw new Error('Both users must be Google accounts with verified email.')
const refs = users.map((user) => db.ref(`shopMemberships/${user.uid}/${SHOP_ID}`)); const existing = await Promise.all(refs.map((membershipRef) => membershipRef.get()))
if (existing.some((snapshot) => snapshot.exists())) throw new Error('Existing membership detected; refusing to overwrite it.')
const now = new Date().toISOString()
const permissions = Object.fromEntries(['manageProducts','manageCategories','manageImages','manageOrders','managePricing','manageDiscounts','manageInventory','manageStoreSettings','manageWhatsApp','manageEmployees','manageReports','manageActivityLogs','manageAiAssistant','manageAdministrators'].map((key) => [key, true]))
const updates = {}; users.forEach((user) => { updates[`shopMemberships/${user.uid}/${SHOP_ID}`] = { uid: user.uid, email: user.email, role: 'SUPER_ADMIN', active: true, immutableBootstrap: true, permissions, provisionedAt: now, provisionedBy: 'trusted-provisioning-script' } })
updates[`shops/${SHOP_ID}/private/activityLogs/${Date.now()}`] = { action: 'INITIAL_SUPER_ADMIN_PROVISION', actor: 'trusted-provisioning-script', uids: users.map((user) => user.uid), createdAt: now }
console.log(JSON.stringify({ project: PROJECT_ID, shop: SHOP_ID, commit, users: users.map((user) => ({ uid: user.uid, email: user.email, emailVerified: user.emailVerified })) }, null, 2))
if (commit) await db.ref().update(updates)
else console.log('DRY RUN: no Firebase data was written. Add --commit only after reviewing the exact UID/email matches.')
