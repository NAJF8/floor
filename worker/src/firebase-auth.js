let keyCache = null

function decode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized), character => character.charCodeAt(0))))
}

async function keys() {
  if (keyCache && keyCache.expiresAt > Date.now()) return keyCache.value
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
  if (!response.ok) throw new Error('AUTH_KEYS_UNAVAILABLE')
  keyCache = { value: await response.json(), expiresAt: Date.now() + 3600000 }
  return keyCache.value
}

export async function verifyFirebaseIdToken(request, env) {
  const header = request.headers.get('Authorization') || ''
  if (!header.startsWith('Bearer ')) throw new Error('UNAUTHENTICATED')
  const token = header.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('AUTH_TOKEN_INVALID')
  let jwtHeader, payload
  try { jwtHeader = decode(parts[0]); payload = decode(parts[1]) } catch { throw new Error('AUTH_TOKEN_INVALID') }
  const now = Math.floor(Date.now() / 1000)
  if (jwtHeader.alg !== 'RS256' || !jwtHeader.kid || payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || typeof payload.sub !== 'string' || !payload.sub || Number(payload.exp) <= now || Number(payload.iat) > now + 60) throw new Error('AUTH_TOKEN_INVALID')
  const jwk = (await keys()).keys?.find(item => item.kid === jwtHeader.kid)
  if (!jwk) throw new Error('AUTH_TOKEN_INVALID')
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const encodedSignature = parts[2].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - parts[2].length % 4) % 4)
  const signature = Uint8Array.from(atob(encodedSignature), character => character.charCodeAt(0))
  if (!await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error('AUTH_TOKEN_INVALID')
  return { uid: payload.sub, email: payload.email || '', claims: payload }
}
