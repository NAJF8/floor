import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

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
export const auth = getAuth(firebaseApp)
export const database = getDatabase(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
export const SHOP_ID = 'floor-232bc'
