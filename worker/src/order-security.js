export const MAX_ORDER_BODY_BYTES = 64 * 1024

export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowlist = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  return { origin, allowed: !origin || allowlist.includes(origin) }
}

export async function readJsonBody(request, maxBytes = MAX_ORDER_BODY_BYTES) {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > maxBytes) throw new Error('REQUEST_BODY_TOO_LARGE')
  if (!request.body) return {}
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maxBytes) throw new Error('REQUEST_BODY_TOO_LARGE')
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export async function enforceRateLimit(request, env, key) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== 'function') throw new Error('RATE_LIMITER_NOT_CONFIGURED')
  const result = await env.RATE_LIMITER.limit({ key: `${key}:${request.method}` })
  if (!result?.success) throw new Error('RATE_LIMITED')
}
