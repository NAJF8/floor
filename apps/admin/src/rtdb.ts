import { get, onValue, ref, type Unsubscribe } from 'firebase/database'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions, getFirebaseDatabase, SHOP_ID } from './firebase'

export const shopPath = (suffix: string) => `shops/${SHOP_ID}/${suffix}`

const privatePath = (path: string) => path.includes(`/private/`) || path.endsWith('/private') || /\/shops\/[^/]+\/products(?:\/|$)/.test(`/${path}`)
async function adminRead(path: string) { const call = httpsCallable(getFirebaseFunctions(), 'adminRead'); return (await call({ path })).data as { data?: unknown } }

export function subscribeMap<T>(path: string, callback: (value: Record<string, T>) => void, onError?: (error: Error) => void): Unsubscribe {
  if (privatePath(path)) {
    let closed = false
    const refresh = async () => { try { const result = await adminRead(path); if (!closed) callback(result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data as Record<string, T> : {}) } catch (error) { if (!closed) onError?.(error instanceof Error ? error : new Error('تعذر قراءة البيانات الخاصة.')) } }
    void refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { closed = true; window.clearInterval(timer) }
  }
  return onValue(ref(getFirebaseDatabase(), path), (snapshot) => callback(snapshot.exists() ? snapshot.val() as Record<string, T> : {}), (error) => onError?.(error))
}

export async function readValue<T>(path: string): Promise<T | null> { if (privatePath(path)) { const result = await adminRead(path); return (result.data ?? null) as T | null } const snapshot = await get(ref(getFirebaseDatabase(), path)); return snapshot.exists() ? snapshot.val() as T : null }
async function adminWrite(operation: string, path: string, value?: unknown) { const call = httpsCallable(getFirebaseFunctions(), 'adminWrite'); return (await call({ operation, path, value })).data as { key?: string } }
export async function createRecord<T extends object>(path: string, value: T) { const result = await adminWrite('create', path, value); return result.key as string }
export async function updateRecord(path: string, value: object) { await adminWrite('update', path, value) }
