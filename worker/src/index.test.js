import test from 'node:test'
import assert from 'node:assert/strict'
import { handleUpload, uploadToGitHub, validateUploadFile } from './index.js'

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

test('accepts valid PNG, MP4 and WebM signatures and rejects renamed files', async () => {
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'hero.png', { type: 'image/png' })
  const mp4 = new File([new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])], 'hero.mp4', { type: 'video/mp4' })
  const webm = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'hero.webm', { type: 'video/webm' })
  const fake = new File(['not-media'], 'hero.mp4', { type: 'video/mp4' })
  assert.equal((await validateUploadFile(png)).ok, true)
  assert.equal((await validateUploadFile(mp4)).ok, true)
  assert.equal((await validateUploadFile(webm)).ok, true)
  assert.deepEqual(await validateUploadFile(fake), { ok: false, error: 'FILE_VALIDATION_FAILED' })
})

test('rejects unsupported media types and files over the conservative GitHub limit', async () => {
  const text = new File(['hello'], 'hero.txt', { type: 'text/plain' })
  const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'hero.mp4', { type: 'video/mp4' })
  assert.deepEqual(await validateUploadFile(text), { ok: false, error: 'FILE_VALIDATION_FAILED' })
  assert.deepEqual(await validateUploadFile(large), { ok: false, error: 'FILE_TOO_LARGE' })
})

test('accepts only a complete GitHub Contents API response and returns its public download URL', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ content: { path: 'public/uploads/floor-232bc/hero-media/a.mp4', size: 12, download_url: 'https://raw.example/a.mp4' }, commit: { sha: 'commit-sha' } }), { status: 201 })
  try {
    const file = new File([new Uint8Array(12)], 'hero.mp4', { type: 'video/mp4' })
    const result = await uploadToGitHub(file, 'public/uploads/floor-232bc/hero-media/a.mp4', { GITHUB_TOKEN: 'fixture-token', GITHUB_OWNER: 'NAJF8', GITHUB_REPO: 'floor', GITHUB_BRANCH: 'main' })
    assert.deepEqual(result, { commitSha: 'commit-sha', downloadUrl: 'https://raw.example/a.mp4' })
  } finally { globalThis.fetch = originalFetch }
})
