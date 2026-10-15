const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATABASE_SCOPE = 'https://www.googleapis.com/auth/firebase.database'
const DEFAULT_TIMEOUT_MS = 5000

function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlText(value) {
  return base64Url(new TextEncoder().encode(value))
}

function pemBytes(pem) {
  const value = String(pem || '').replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function errorCode(error, fallback = 'RTDB_NETWORK_ERROR') {
  if (error?.name === 'AbortError') return 'RTDB_TIMEOUT'
  return error?.code || fallback
}

export function createServiceAccountTokenProvider({ env, fetchImpl = fetch, now = () => Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let signingKeyPromise
  let cached = null
  const getSigningKey = () => signingKeyPromise ||= crypto.subtle.importKey('pkcs8', pemBytes(env?.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  return async function getAccessToken() {
    const currentSeconds = Math.floor(now() / 1000)
    if (cached && cached.expiresAt > currentSeconds + 60) return cached.value
    if (!env?.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env?.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) throw Object.assign(new Error('SERVICE_ACCOUNT_NOT_CONFIGURED'), { code: 'SERVICE_ACCOUNT_NOT_CONFIGURED' })
    const issuedAt = currentSeconds
    const header = base64UrlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claim = base64UrlText(JSON.stringify({ iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL, scope: DATABASE_SCOPE, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }))
    const unsigned = `${header}.${claim}`
    const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, await getSigningKey(), new TextEncoder().encode(unsigned))
    const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`
    const control = timeoutSignal(timeoutMs)
    try {
      const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(), signal: control.signal })
      if (!response.ok) throw Object.assign(new Error('TOKEN_EXCHANGE_FAILED'), { code: 'TOKEN_EXCHANGE_FAILED' })
      const body = await response.json()
      if (typeof body.access_token !== 'string' || !Number.isFinite(Number(body.expires_in))) throw Object.assign(new Error('TOKEN_RESPONSE_INVALID'), { code: 'TOKEN_RESPONSE_INVALID' })
      cached = { value: body.access_token, expiresAt: issuedAt + Number(body.expires_in) }
      return cached.value
    } catch (error) {
      throw Object.assign(new Error(errorCode(error, 'TOKEN_EXCHANGE_FAILED')), { code: errorCode(error, 'TOKEN_EXCHANGE_FAILED') })
    } finally { control.clear() }
  }
}

export function createRtdbAdapter({ env, fetchImpl = fetch, getAccessToken = createServiceAccountTokenProvider({ env, fetchImpl }), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const databaseUrl = String(env?.FIREBASE_DATABASE_URL || '').replace(/\/$/, '')
  if (!/^https:\/\//.test(databaseUrl) && !(env?.FIREBASE_DATABASE_EMULATOR === 'true' && /^http:\/\//.test(databaseUrl))) throw new Error('RTDB_DATABASE_URL_INVALID')
  const urlFor = path => {
    const pathUrl = `${databaseUrl}/${String(path).replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/')}.json`
    return env?.FIREBASE_DATABASE_EMULATOR === 'true' && env?.FIREBASE_DATABASE_EMULATOR_NAMESPACE ? `${pathUrl}?ns=${encodeURIComponent(env.FIREBASE_DATABASE_EMULATOR_NAMESPACE)}` : pathUrl
  }

  async function request(path, options = {}) {
    const token = await getAccessToken()
    const control = timeoutSignal(timeoutMs)
    try {
      const response = await fetchImpl(urlFor(path), { ...options, headers: { ...(options.headers || {}), authorization: `Bearer ${token}`, accept: 'application/json' }, signal: control.signal })
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'RTDB_PERMISSION_DENIED' : response.status >= 500 ? 'RTDB_UNAVAILABLE' : 'RTDB_REQUEST_FAILED'
        throw Object.assign(new Error(code), { code, status: response.status })
      }
      return response
    } catch (error) {
      if (error?.code) throw error
      throw Object.assign(new Error(errorCode(error)), { code: errorCode(error) })
    } finally { control.clear() }
  }

  return {
    async read(path) { return (await request(path)).json() },
    async readWithEtag(path) {
      const response = await request(path, { headers: { 'X-Firebase-ETag': 'true' } })
      return { value: await response.json(), etag: response.headers.get('etag') || '' }
    },
    async write(path, value) {
      const response = await request(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
      return response.json()
    },
    async readSnapshot() {
      return this.read(`shops/${env.FIREBASE_SHOP_ID || 'floor-232bc'}`)
    },
    async writeOrderAtomically() {
      throw Object.assign(new Error('ATOMIC_STOCK_COORDINATOR_REQUIRED'), { code: 'ATOMIC_STOCK_COORDINATOR_REQUIRED' })
    },
  }
}

export const rtdbAdapterInternals = { base64Url, pemBytes }
