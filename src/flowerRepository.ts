import { onValue, ref, type Unsubscribe } from 'firebase/database'
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
  active?: boolean
  stock?: number
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

  return onValue(ref(firebaseDatabase, `shops/${shopId}/products`), snapshot => {
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
      if (record.active === false) continue
      products.push({
        id,
        name: record.name,
        ...(typeof record.nameEn === 'string' ? { nameEn: record.nameEn } : {}),
        price: Number(record.price),
        category: record.category,
        ...(typeof record.image === 'string' ? { image: record.image } : {}),
        ...(Array.isArray(record.imageUrls) ? { imageUrls: record.imageUrls.filter((item): item is string => typeof item === 'string') } : {}),
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
        ...(typeof record.stock === 'number' ? { stock: record.stock } : {}),
        active: true,
      })
    }
    onProducts(products)
  }, error => onError(error))
}
