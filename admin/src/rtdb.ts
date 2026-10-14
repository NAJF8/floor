import { get, onValue, push, ref, runTransaction, update, type Unsubscribe } from 'firebase/database'
import { getFirebaseDatabase, SHOP_ID } from './firebase'

export const shopPath = (suffix: string) => `shops/${SHOP_ID}/${suffix}`

const directRoots = [
  `shops/${SHOP_ID}/products`,
  `shops/${SHOP_ID}/public/categories`,
  `shops/${SHOP_ID}/public/discounts`,
  `shops/${SHOP_ID}/public/delivery`,
  `shops/${SHOP_ID}/public/paymentMethods`,
  `shops/${SHOP_ID}/public/homepage`,
  `shops/${SHOP_ID}/public/settings`,
  `shops/${SHOP_ID}/public/aiAssistant`,
  `shops/${SHOP_ID}/private/inventory`,
]

const isDirectPath = (path: string) => directRoots.some(root => path === root || path.startsWith(`${root}/`))
const backendRequired = () => new Error('هذه العملية تتطلب Backend موثوقاً؛ لم يتم تفعيل Cloud Functions في هذا المسار.')
const ensureDirectPath = (path: string) => { if (!isDirectPath(path)) throw backendRequired() }

export function subscribeMap<T>(path: string, callback: (value: Record<string, T>) => void, onError?: (error: Error) => void): Unsubscribe {
  if (!isDirectPath(path)) { onError?.(backendRequired()); return () => undefined }
  return onValue(ref(getFirebaseDatabase(), path), (snapshot) => callback(snapshot.exists() ? snapshot.val() as Record<string, T> : {}), (error) => onError?.(error))
}

export async function readValue<T>(path: string): Promise<T | null> { ensureDirectPath(path); const snapshot = await get(ref(getFirebaseDatabase(), path)); return snapshot.exists() ? snapshot.val() as T : null }
export async function createRecord<T extends object>(path: string, value: T) { ensureDirectPath(path); const record = push(ref(getFirebaseDatabase(), path)); await update(ref(getFirebaseDatabase()), { [`${path}/${record.key}`]: value }); return record.key as string }
export async function updateRecord(path: string, value: object) { ensureDirectPath(path); await update(ref(getFirebaseDatabase(), path), value) }
export async function updateInventoryTransaction<T>(path: string, updater: (current: T | null) => T | null) { ensureDirectPath(path); const result = await runTransaction(ref(getFirebaseDatabase(), path), current => updater(current as T | null)); if (!result.committed) throw new Error('تعذر تثبيت تحديث المخزون بسبب تعارض متزامن.') }

