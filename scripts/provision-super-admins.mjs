import { randomUUID } from 'node:crypto'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase, ServerValue } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const EXPECTED = new Map([
  ['mohameadalhaear100@gmail.com', null],
  ['alasastech0@gmail.com', null],
])
const args = new Set(process.argv.slice(2))
const suppliedUids = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const commit = args.has('--commit')

if (suppliedUids.length !== 2 || args.has('--help')) {
  console.error('Usage: node scripts/provision-super-admins.mjs <uid-one> <uid-two> [--commit]')
  console.error('The default mode is dry-run. --commit is required to create missing membership records.')
  process.exit(2)
}

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault()
if (!getApps().length) initializeApp({ credential, databaseURL: 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app' })
const auth = getAuth()
const database = getDatabase()
const verifiedUsers = []

for (const uid of suppliedUids) {
  const user = await auth.getUser(uid)
  const email = user.email?.toLowerCase()
  if (!email || !EXPECTED.has(email)) throw new Error(`UID ${uid} is not one of the two approved Google accounts.`)
  if (!user.emailVerified) throw new Error(`${email} is not verified in Firebase Auth.`)
  if (!user.providerData.some((provider) => provider.providerId === 'google.com')) throw new Error(`${email} is not linked to Google Sign-In.`)
  if (EXPECTED.get(email)) throw new Error(`Duplicate approved email supplied: ${email}`)
  EXPECTED.set(email, uid)
  verifiedUsers.push(user)
}
for (const [email, uid] of EXPECTED) if (!uid) throw new Error(`Missing UID for ${email}. Both approved accounts are required.`)

const membershipRefs = verifiedUsers.map((user) => database.ref(`shopMemberships/${user.uid}/${SHOP_ID}`))
const existing = await Promise.all(membershipRefs.map((membershipRef) => membershipRef.once('value')))
if (existing.some((snapshot) => snapshot.exists())) throw new Error('An existing membership was found. No record was overwritten.')

const permissions = {
  manageProducts: true, manageCategories: true, manageImages: true, manageOrders: true,
  managePricing: true, manageDiscounts: true, manageInventory: true, manageStoreSettings: true,
  manageWhatsApp: true, manageEmployees: true, manageReports: true, manageActivityLogs: true,
  manageAiAssistant: true, manageAdministrators: true,
}
const now = ServerValue.TIMESTAMP
const auditId = `initial-super-admins-${Date.now()}-${randomUUID().slice(0, 8)}`
const updates = {}
for (const user of verifiedUsers) updates[`shopMemberships/${user.uid}/${SHOP_ID}`] = {
  uid: user.uid, email: user.email, role: 'SUPER_ADMIN', active: true, immutableBootstrap: true,
  permissions, createdAt: now, updatedAt: now, provisionedBy: 'trusted-initial-super-admin-process',
}
updates[`shops/${SHOP_ID}/private/activityLogs/${auditId}`] = {
  action: 'INITIAL_SUPER_ADMIN_PROVISIONED', actor: 'trusted-initial-super-admin-process',
  targetUids: verifiedUsers.map((user) => user.uid), targetEmails: verifiedUsers.map((user) => user.email), createdAt: now,
}

console.log(JSON.stringify({ project: 'floor-232bc', shopId: SHOP_ID, accounts: verifiedUsers.map((user) => ({ uid: user.uid, email: user.email, emailVerified: user.emailVerified, googleProvider: true })), mode: commit ? 'commit' : 'dry-run' }, null, 2))
if (!commit) {
  console.log('Dry-run only: no Firebase data was written. Re-run with --commit after reviewing the verified UIDs.')
  process.exit(0)
}
await database.ref().update(updates)
console.log('Committed two immutable bootstrap SUPER_ADMIN memberships and one audit log entry.')
