import test from 'node:test'
import assert from 'node:assert/strict'
import { handleUpload } from './index.js'

const env = {
  FIREBASE_PROJECT_ID: 'floor-232bc',
  FIREBASE_DATABASE_URL: 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app',
  ALLOWED_ORIGINS: 'https://najf8.github.io,http://localhost:5173',
}

test('rejects origins outside the storefront allowlist', async () => {
  const response = await handleUpload(new Request('https://worker.example/upload', { method: 'POST', headers: { Origin: 'https://evil.example' } }), env)
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'origin_not_allowed' })
})

test('rejects anonymous upload requests', async () => {
  const response = await handleUpload(new Request('https://worker.example/upload', { method: 'POST', headers: { Origin: 'https://najf8.github.io' } }), env)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'unauthenticated' })
})

test('answers preflight without exposing secrets', async () => {
  const response = await handleUpload(new Request('https://worker.example/upload', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})
