import { equalTo, onValue, orderByChild, query, ref, type Unsubscribe } from 'firebase/database'
import { firebaseDatabase } from './firebase'

export type FlowerProductRecord = {
  id: string
  name: string
  nameEn?: string
  price: number
  category: string
  image?: string
  imageUrls?: string[]
  description?: string
  compareAtPrice?: number
  discountPercent?: number
  badge?: string
  packaging?: string
  colors?: string[]
  addOns?: string[]
  active?: boolean
  status?: string
  stock?: number
}

export type FlowerCategoryRecord = { id: string; name: string; description?: string; image?: string; order?: number; visible?: boolean; status?: string }

export type PaymentMethodRecord = {
  id: string
  name: string
  type: string
  enabled: boolean
  recipient?: string
  instructions?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  iban?: string
  walletNumber?: string
  provinces?: string[]
  order?: number
}

export type DeliveryAreaRecord = { price: number; enabled?: boolean; deliveryAt?: string }
export type DeliveryProvinceRecord = { enabled?: boolean; areas?: Record<string, DeliveryAreaRecord>; districts?: Record<string, DeliveryAreaRecord> }
export type ShopPublicConfig = {
  paymentMethods: Record<string, PaymentMethodRecord>
  delivery: Record<string, DeliveryProvinceRecord>
  settings: Record<string, unknown>
  homepage: Record<string, unknown>
  aiAssistant: Record<string, unknown>
}

/**
 * Watch one shop's products. Returns an unsubscribe function.
 * Requires explicit, least-privilege Firebase RTDB security rules.
 * An empty snapshot is an empty catalog, not a reason to seed demo data.
 */
export function subscribeToShopProducts(
  shopId: string,
  onProducts: (products: FlowerProductRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shopId)) {
    throw new Error('Invalid shop ID')
  }

  const publishedProducts = query(ref(firebaseDatabase, `shops/${shopId}/products`), orderByChild('status'), equalTo('PUBLISHED'))
  return onValue(publishedProducts, snapshot => {
    const value: unknown = snapshot.val()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      onProducts([])
      return
    }

    const products: FlowerProductRecord[] = []
    for (const [id, item] of Object.entries(value)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      if (typeof record.name !== 'string' || typeof record.price !== 'number' || !Number.isFinite(record.price) || typeof record.category !== 'string') continue
      if (record.active === false || ['HIDDEN', 'DRAFT', 'UNAVAILABLE', 'ARCHIVED'].includes(String(record.status || '').toUpperCase())) continue
      products.push({
        id,
        name: record.name,
        ...(typeof record.nameEn === 'string' ? { nameEn: record.nameEn } : {}),
        price: Number(record.price),
        category: record.category,
        ...(typeof record.image === 'string' ? { image: record.image } : {}),
        ...(Array.isArray(record.imageUrls) ? { imageUrls: record.imageUrls.filter((item): item is string => typeof item === 'string') } : {}),
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
        ...(Number.isInteger(record.compareAtPrice) && (record.compareAtPrice as number) > Number(record.price) ? { compareAtPrice: record.compareAtPrice as number } : {}),
        ...(Number.isInteger(record.discountPercent) && (record.discountPercent as number) > 0 ? { discountPercent: record.discountPercent as number } : {}),
        ...(typeof record.badge === 'string' ? { badge: record.badge } : {}),
        ...(typeof record.packaging === 'string' ? { packaging: record.packaging } : {}),
        ...(Array.isArray(record.colors) ? { colors: record.colors.filter((item): item is string => typeof item === 'string') } : {}),
        ...(Array.isArray(record.addOns) ? { addOns: record.addOns.filter((item): item is string => typeof item === 'string') } : {}),
        ...(typeof record.status === 'string' ? { status: record.status } : {}),
        ...(typeof record.stock === 'number' ? { stock: record.stock } : {}),
        active: true,
      })
    }
    onProducts(products)
  }, error => onError(error))
}

export function subscribeToShopCategories(
  shopId: string,
  onCategories: (categories: FlowerCategoryRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onValue(ref(firebaseDatabase, `shops/${shopId}/public/categories`), snapshot => {
    const value: unknown = snapshot.val()
    if (!value || typeof value !== 'object' || Array.isArray(value)) { onCategories([]); return }
    const categories: FlowerCategoryRecord[] = []
    for (const [id, item] of Object.entries(value)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      if (typeof record.name !== 'string' || record.visible === false || ['HIDDEN', 'DRAFT', 'ARCHIVED'].includes(String(record.status || '').toUpperCase())) continue
      categories.push({ id, name: record.name, ...(typeof record.description === 'string' ? { description: record.description } : {}), ...(typeof record.image === 'string' ? { image: record.image } : {}), ...(Number.isInteger(record.order) ? { order: record.order as number } : {}), visible: true })
    }
    categories.sort((a, b) => (a.order || 0) - (b.order || 0))
    onCategories(categories)
  }, error => onError(error))
}

export function subscribeToShopPublicConfig(
  shopId: string,
  onConfig: (config: ShopPublicConfig) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onValue(ref(firebaseDatabase, `shops/${shopId}/public`), snapshot => {
    const value = snapshot.val()
    const paymentMethods: Record<string, PaymentMethodRecord> = {}
    const rawPaymentMethods = value?.paymentMethods
    if (rawPaymentMethods && typeof rawPaymentMethods === 'object' && !Array.isArray(rawPaymentMethods)) {
      for (const [id, item] of Object.entries(rawPaymentMethods)) {
        const record = item as Record<string, unknown>
        if (typeof record.name === 'string' && typeof record.type === 'string' && record.enabled === true) {
          paymentMethods[id] = { id, name: record.name, type: record.type, enabled: true, ...(typeof record.recipient === 'string' ? { recipient: record.recipient } : {}), ...(typeof record.instructions === 'string' ? { instructions: record.instructions } : {}), ...(typeof record.bankName === 'string' ? { bankName: record.bankName } : {}), ...(typeof record.accountName === 'string' ? { accountName: record.accountName } : {}), ...(typeof record.accountNumber === 'string' ? { accountNumber: record.accountNumber } : {}), ...(typeof record.iban === 'string' ? { iban: record.iban } : {}), ...(typeof record.walletNumber === 'string' ? { walletNumber: record.walletNumber } : {}), ...(Array.isArray(record.provinces) ? { provinces: record.provinces.filter((item): item is string => typeof item === 'string') } : {}), ...(Number.isInteger(record.order) ? { order: record.order as number } : {}) }
        }
      }
    }
    const delivery: Record<string, DeliveryProvinceRecord> = {}
    const rawDelivery = value?.delivery
    if (rawDelivery && typeof rawDelivery === 'object' && !Array.isArray(rawDelivery)) {
      for (const [province, item] of Object.entries(rawDelivery)) {
        const record = item as Record<string, unknown>
        const areas = (record.areas || record.districts) as Record<string, unknown> | undefined
        if (!areas || typeof areas !== 'object' || Array.isArray(areas)) continue
        const normalizedAreas: Record<string, DeliveryAreaRecord> = {}
        for (const [district, area] of Object.entries(areas)) {
          const areaRecord = area as Record<string, unknown>
          if (Number.isInteger(areaRecord.price) && (areaRecord.price as number) >= 0 && areaRecord.enabled !== false) normalizedAreas[district] = { price: areaRecord.price as number, ...(typeof areaRecord.deliveryAt === 'string' ? { deliveryAt: areaRecord.deliveryAt } : {}) }
        }
        delivery[province] = { enabled: record.enabled !== false, areas: normalizedAreas }
      }
    }
    onConfig({ paymentMethods, delivery, settings: value?.settings && typeof value.settings === 'object' && !Array.isArray(value.settings) ? value.settings : {}, homepage: value?.homepage && typeof value.homepage === 'object' && !Array.isArray(value.homepage) ? value.homepage : {}, aiAssistant: value?.aiAssistant && typeof value.aiAssistant === 'object' && !Array.isArray(value.aiAssistant) ? value.aiAssistant : {} })
  }, error => onError(error))
}
