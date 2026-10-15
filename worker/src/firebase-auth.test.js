import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyFirebaseIdToken } from './firebase-auth.js'

test('ADMIN_AUTH rejects missing, malformed, and unsigned tokens before any key fetch', async () => {
  const env = { FIREBASE_PROJECT_ID: 'floor-232bc' }
  await assert.rejects(verifyFirebaseIdToken(new Request('https://orders.example', { headers: {} }), env), /UNAUTHENTICATED/)
  await assert.rejects(verifyFirebaseIdToken(new Request('https://orders.example', { headers: { Authorization: 'Bearer malformed' } }), env), /AUTH_TOKEN_INVALID/)
  await assert.rejects(verifyFirebaseIdToken(new Request('https://orders.example', { headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJhdWQiOiJmbG9vci0yMzJiYyJ9.' } }), env), /AUTH_TOKEN_INVALID/)
})
