import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

// Firebase's web configuration identifies the client app; security is enforced by
// Firebase Authentication and Realtime Database Rules, not by hiding this config.
// Never put service-account credentials or an AI provider secret in frontend code.
const firebaseConfig = {
  apiKey: 'AIzaSyCcKPzrQWwt42Ff3e7RSdWGrgdcu-zuQ0Q',
  authDomain: 'floor-232bc.firebaseapp.com',
  databaseURL: 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'floor-232bc',
  storageBucket: 'floor-232bc.firebasestorage.app',
  messagingSenderId: '1060600858396',
  appId: '1:1060600858396:web:beb2523ab6233882ff9cd9',
  measurementId: 'G-Y0GDK5FMKJ',
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
export const firebaseDatabase = getDatabase(firebaseApp)
export const firebaseFunctions = getFunctions(firebaseApp, 'europe-west1')
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
export const SHOP_ID = 'floor-232bc'

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
  const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099)
  const databasePort = Number(import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_PORT || 9000)
  const functionsPort = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001)
  try { connectAuthEmulator(firebaseAuth, `http://${host}:${authPort}`, { disableWarnings: true }) } catch { /* already connected during local HMR */ }
  try { connectDatabaseEmulator(firebaseDatabase, host, databasePort) } catch { /* already connected during local HMR */ }
  try { connectFunctionsEmulator(firebaseFunctions, host, functionsPort) } catch { /* already connected during local HMR */ }
}
