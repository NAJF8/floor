import { get, onValue, push, ref, runTransaction, update, type Unsubscribe } from 'firebase/database'
import { getFirebaseDatabase, SHOP_ID, auth } from './firebase'

export const shopPath = (suffix: string) => `shops/${SHOP_ID}/${suffix}`

const directRoots = [
  `shops/${SHOP_ID}/products`,
  `shops/${SHOP_ID}/public/demoProducts`,
  `shops/${SHOP_ID}/public/categories`,
  `shops/${SHOP_ID}/public/discounts`,
  `shops/${SHOP_ID}/public/delivery`,
  `shops/${SHOP_ID}/public/paymentMethods`,
  `shops/${SHOP_ID}/public/homepage`,
  `shops/${SHOP_ID}/public/settings`,
  `shops/${SHOP_ID}/public/aiAssistant`,
  `shops/${SHOP_ID}/public/gifting`,
  `shops/${SHOP_ID}/admin/gifting`,
  `shops/${SHOP_ID}/private/inventory`,
]

const isDirectPath = (path: string) => directRoots.some(root => path === root || path.startsWith(`${root}/`))
const backendRequired = () => new Error('هذه العملية تتطلب Backend موثوقاً؛ لم يتم تفعيل Cloud Functions في هذا المسار.')
const isGiftingAdminPath = (path: string) => path === `shops/${SHOP_ID}/admin/gifting` || path.startsWith(`shops/${SHOP_ID}/admin/gifting/`)
const isGiftingPublicPath = (path: string) => path === `shops/${SHOP_ID}/public/gifting` || path.startsWith(`shops/${SHOP_ID}/public/gifting/`)
const canonicalGiftingDraftPath = (path: string) => isGiftingPublicPath(path) ? path.replace(`/public/gifting`, `/admin/gifting`) : path
const isGiftingPath = (path: string) => isGiftingAdminPath(path) || isGiftingPublicPath(path)
const ensureDirectPath = (path: string) => { if (!isDirectPath(path)) throw backendRequired() }

export function subscribeMap<T>(path: string, callback: (value: Record<string, T>) => void, onError?: (error: Error) => void): Unsubscribe {
  if (!isDirectPath(path)) { onError?.(backendRequired()); return () => undefined }
  return onValue(ref(getFirebaseDatabase(), path), (snapshot) => callback(snapshot.exists() ? snapshot.val() as Record<string, T> : {}), (error) => onError?.(error))
}

export async function readValue<T>(path: string): Promise<T | null> { ensureDirectPath(path); const snapshot = await get(ref(getFirebaseDatabase(), path)); return snapshot.exists() ? snapshot.val() as T : null }
async function verifyReadback(path: string, expected: unknown) {
  const snapshot = await get(ref(getFirebaseDatabase(), path))
  if (expected === null) { if (snapshot.exists()) throw new Error(`Firebase readback failed: ${path} still exists.`); return }
  if (!snapshot.exists()) throw new Error(`Firebase readback failed: ${path} is missing.`)
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) if (JSON.stringify(snapshot.child(key).val()) !== JSON.stringify(value)) throw new Error(`Firebase readback failed: ${path}/${key}.`)
  } else if (JSON.stringify(snapshot.val()) !== JSON.stringify(expected)) throw new Error(`Firebase readback failed: ${path}.`)
}
async function verifyPaths(updates: Record<string, unknown>) { await Promise.all(Object.entries(updates).map(([path, value]) => verifyReadback(path, value))) }
async function giftingWrite(operation: 'create' | 'update' | 'publish' | 'hide', path: string, value?: object) { const endpoint = String(import.meta.env.VITE_GIFTING_BACKEND_ENDPOINT || '').trim(); if (!endpoint) throw new Error('لم يتم إعداد Backend الإهداءات.'); const token = await auth.currentUser?.getIdToken(true); if (!token) throw new Error('سجّل الدخول بحساب Google إداري قبل الحفظ.'); const canonicalPath = canonicalGiftingDraftPath(path); const response = await fetch(endpoint.replace(/\/$/, '') + '/api/admin/gifting', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ operation, path: canonicalPath, ...(value === undefined ? {} : { value }) }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(String(result.error || 'تعذر حفظ الإهداء عبر Backend.')); return { ...result, path: result.path || canonicalPath }
}
export async function createRecord<T extends object>(path: string, value: T) { ensureDirectPath(path); if (isGiftingPath(path)) { const canonicalPath = canonicalGiftingDraftPath(path); const record = push(ref(getFirebaseDatabase(), canonicalPath)); const target = `${canonicalPath}/${record.key}`; await update(ref(getFirebaseDatabase()), { [target]: value }); await verifyReadback(target, value); return record.key as string } const record = push(ref(getFirebaseDatabase(), path)); const target = `${path}/${record.key}`; await update(ref(getFirebaseDatabase()), { [target]: value }); await verifyReadback(target, value); return record.key as string }
export async function updateRecord(path: string, value: object) { ensureDirectPath(path); if (isGiftingPath(path)) { const canonicalPath = canonicalGiftingDraftPath(path); await update(ref(getFirebaseDatabase(), canonicalPath), value); await verifyReadback(canonicalPath, value); return } await update(ref(getFirebaseDatabase(), path), value); await verifyReadback(path, value) }
export async function publishGiftingRecord(draftPath: string) {
  const canonicalPath = canonicalGiftingDraftPath(draftPath)
  if (!isGiftingAdminPath(canonicalPath)) throw new Error('مسار مسودة الإهداء غير صالح.')
  await giftingWrite('publish', canonicalPath)
}
export async function hideGiftingRecord(draftPath: string) {
  const canonicalPath = canonicalGiftingDraftPath(draftPath)
  if (!isGiftingAdminPath(canonicalPath)) throw new Error('مسار مسودة الإهداء غير صالح.')
  await giftingWrite('hide', canonicalPath)
}
export async function updatePaths(updates: Record<string, unknown>) { Object.keys(updates).forEach(ensureDirectPath); await update(ref(getFirebaseDatabase()), updates); await verifyPaths(updates) }
export async function createRecordWithPaths<T extends object>(path: string, value: T, extra: (id: string) => Record<string, unknown> = () => ({})) { ensureDirectPath(path); const record = push(ref(getFirebaseDatabase(), path)); const target = `${path}/${record.key}`; const updates = { [target]: value, ...extra(record.key as string) }; Object.keys(updates).forEach(ensureDirectPath); await update(ref(getFirebaseDatabase()), updates); await verifyPaths(updates); return record.key as string }
export async function updateInventoryTransaction<T>(path: string, updater: (current: T | null) => T | null) { ensureDirectPath(path); const result = await runTransaction(ref(getFirebaseDatabase(), path), current => updater(current as T | null)); if (!result.committed) throw new Error('تعذر تثبيت تحديث المخزون بسبب تعارض متزامن.') }

