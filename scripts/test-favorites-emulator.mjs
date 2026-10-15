import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectDatabaseEmulator, get, getDatabase, ref, set } from 'firebase/database'

const runId = Date.now().toString(36)
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:19100'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:19199'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || 'floor-gifting-isolated-default-rtdb'
const projectId = 'floor-gifting-isolated'
function createClient(label) {
  const app = initializeApp({ apiKey: 'local', authDomain: 'localhost', projectId, databaseURL: `http://${host}?ns=${namespace}` }, `favorites-${label}-${runId}`)
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const database = getDatabase(app); connectDatabaseEmulator(database, ...host.split(':'))
  return { app, auth, database }
}
async function signUp(client, label) { const email = `${label}-${runId}@favorites.invalid`; await createUserWithEmailAndPassword(client.auth, email, 'StrongPass123!'); return { email, password: 'StrongPass123!' } }
const a = createClient('a'); const b = createClient('b')
const path = (uid) => `users/${uid}/favorites/rose`
try {
  const credentialsA = await signUp(a, 'customer-a'); await signUp(b, 'customer-b')
  await set(ref(a.database, path(a.auth.currentUser.uid)), true)
  assert.equal((await get(ref(a.database, path(a.auth.currentUser.uid)))).val(), true)
  let crossReadDenied = false; try { await get(ref(b.database, path(a.auth.currentUser.uid))) } catch { crossReadDenied = true }; assert.equal(crossReadDenied, true)
  let crossWriteDenied = false; try { await set(ref(b.database, path(a.auth.currentUser.uid)), true) } catch { crossWriteDenied = true }; assert.equal(crossWriteDenied, true)
  await set(ref(a.database, path(a.auth.currentUser.uid)), null)
  assert.equal((await get(ref(a.database, path(a.auth.currentUser.uid)))).exists(), false)
  await signOut(a.auth)
  let logoutDenied = false; try { await get(ref(a.database, path(a.auth.currentUser.uid))) } catch { logoutDenied = true }; assert.equal(logoutDenied, true)
  await signInWithEmailAndPassword(a.auth, credentialsA.email, credentialsA.password)
  assert.equal((await get(ref(a.database, path(a.auth.currentUser.uid)))).exists(), false)
  console.log(JSON.stringify({ FAVORITES_SAVE: 'PASS', FAVORITES_REMOVE_AND_REFRESH: 'PASS', FAVORITES_ACCOUNT_ISOLATION: 'PASS', FAVORITES_LOGOUT: 'PASS' }))
} finally { await deleteApp(a); await deleteApp(b) }
