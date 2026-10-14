import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(dbHost) || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(functionsHost)) throw new Error('Refusing to run outside local Firebase emulators.')

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${dbHost}?ns=${namespace}` }, `staff-test-${Date.now()}`)
const db = getDatabase(app)
async function signUp(label) {
  const email = `${label}-${Date.now()}@example.test`
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'LocalOnly-123456', returnSecureToken: true }) })
  const body = await response.json(); if (!response.ok) throw new Error(JSON.stringify(body)); return { email, uid: body.localId, token: body.idToken }
}
async function call(name, token, data) {
  const response = await fetch(`http://${functionsHost}/${SHOP_ID}/europe-west1/${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }) })
  const body = await response.json(); if (!response.ok || body.error) throw Object.assign(new Error(body.error?.message || name), { status: body.error?.status }); return body.result
}
async function expectError(name, token, data, status) { await assert.rejects(call(name, token, data), (error) => error.status === status) }

try {
  const admin = await signUp('admin'); const employee = await signUp('employee'); const viewer = await signUp('viewer'); const superAdmin = await signUp('super')
  await db.ref(`shopMemberships/${admin.uid}/${SHOP_ID}`).set({ uid: admin.uid, email: admin.email, emailLower: admin.email, role: 'ADMIN', active: true, permissions: { staff: true } })
  await db.ref(`shopMemberships/${viewer.uid}/${SHOP_ID}`).set({ uid: viewer.uid, email: viewer.email, role: 'VIEWER', active: true })
  await db.ref(`shopMemberships/${superAdmin.uid}/${SHOP_ID}`).set({ uid: superAdmin.uid, email: superAdmin.email, role: 'SUPER_ADMIN', active: true, immutableBootstrap: true })
  const invite = await call('inviteStaffMember', admin.token, { email: employee.email, role: 'EMPLOYEE' })
  assert.equal(invite.role, 'EMPLOYEE')
  await expectError('inviteStaffMember', admin.token, { email: employee.email.toUpperCase(), role: 'VIEWER' }, 'ALREADY_EXISTS')
  await expectError('inviteStaffMember', viewer.token, { email: `blocked-${Date.now()}@example.test`, role: 'VIEWER' }, 'PERMISSION_DENIED')
  const accepted = await call('acceptStaffInvitation', employee.token, {})
  assert.equal(accepted.uid, employee.uid); assert.equal(accepted.role, 'EMPLOYEE')
  const membership = (await db.ref(`shopMemberships/${employee.uid}/${SHOP_ID}`).get()).val()
  assert.equal(membership.email, employee.email); assert.equal(membership.permissions.staff, false)
  await expectError('acceptStaffInvitation', employee.token, {}, 'ALREADY_EXISTS')
  await call('setStaffMembership', admin.token, { uid: employee.uid, email: employee.email, role: 'MANAGER', active: true })
  assert.equal((await db.ref(`shopMemberships/${employee.uid}/${SHOP_ID}/role`).get()).val(), 'MANAGER')
  await call('setStaffMembership', admin.token, { uid: employee.uid, email: employee.email, role: 'MANAGER', active: false })
  assert.equal((await db.ref(`shopMemberships/${employee.uid}/${SHOP_ID}/active`).get()).val(), false)
  await call('setStaffMembership', admin.token, { uid: employee.uid, email: employee.email, role: 'MANAGER', active: true })
  await expectError('setStaffMembership', admin.token, { uid: superAdmin.uid, email: superAdmin.email, role: 'ADMIN', active: false }, 'PERMISSION_DENIED')
  const second = await signUp('second')
  const secondInvite = await call('inviteStaffMember', admin.token, { email: second.email, role: 'VIEWER' })
  await call('cancelStaffInvitation', admin.token, { invitationId: secondInvite.invitationId })
  await expectError('acceptStaffInvitation', second.token, {}, 'NOT_FOUND')
  const logs = (await db.ref(`shops/${SHOP_ID}/private/activityLogs`).get()).val() || {}
  const actions = Object.values(logs).map((log) => log.action)
  console.log('activityActions', actions)
  for (const action of ['STAFF_INVITATION_CREATED', 'STAFF_INVITATION_ACCEPTED', 'STAFF_MEMBERSHIP_UPDATED', 'STAFF_INVITATION_CANCELLED']) assert.ok(actions.includes(action), action)
  console.log(JSON.stringify({ staffInvitation: 'PASS', duplicatePrevention: 'PASS', invitationAcceptance: 'PASS', roleUpdate: 'PASS', deactivationReactivation: 'PASS', superAdminProtection: 'PASS', unauthorizedCreation: 'PASS', activityLog: 'PASS' }, null, 2))
} finally { await db.ref().remove(); await deleteApp(app) }
