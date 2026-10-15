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
  flowerType?: string
  occasions?: string[]
  featured?: boolean
  bestseller?: boolean
  isNew?: boolean
  active?: boolean
  status?: string
  stock?: number
  demoTag?: string
  orderable?: boolean
  demo?: boolean
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

export type DeliveryAreaRecord = { price: number; enabled?: boolean; deliveryAt?: string; availableDays?: number[]; timeSlots?: string[]; preparationHours?: number; preorderDates?: string[] }
export type DeliveryProvinceRecord = { enabled?: boolean; areas?: Record<string, DeliveryAreaRecord>; districts?: Record<string, DeliveryAreaRecord> }
export type GiftAddonRecord = { id: string; name: string; nameEn?: string; category?: string; price: number; image?: string; stock?: number; enabled: boolean; bouquetCompatible: boolean; order?: number }
export type BouquetOptionRecord = { id: string; label: string; labelEn?: string; price: number; image?: string; enabled: boolean; order?: number }
export type GreetingCardTemplateRecord = { id: string; occasion?: string; text: string; price: number; enabled: boolean; order?: number }
export type GiftConfig = {
  flowerTypes: BouquetOptionRecord[]
  flowerColors: BouquetOptionRecord[]
  stemCounts: BouquetOptionRecord[]
  wrappings: BouquetOptionRecord[]
  wrappingColors: BouquetOptionRecord[]
  ribbons: BouquetOptionRecord[]
  addons: GiftAddonRecord[]
  cards: GreetingCardTemplateRecord[]
  occasions: BouquetOptionRecord[]
  settings: Record<string, unknown>
}
export type ShopPublicConfig = {
  paymentMethods: Record<string, PaymentMethodRecord>
  delivery: Record<string, DeliveryProvinceRecord>
  settings: Record<string, unknown>
  homepage: Record<string, unknown>
  aiAssistant: Record<string, unknown>
}

export const DEFAULT_HOMEPAGE_CONFIG: Record<string, unknown> = {
  heroTitle: 'الهدية الأجمل\nتبدأ بتفاصيلك.',
  heroDescription: 'اختَر باقتك، نسّق ألوانها، وأضف لمستك الخاصة لتصل هديتك كما تخيلتها.',
  bannerImage: '/floor/alasas-logo.jpg',
  heroMediaType: 'image',
  heroMediaUrl: '',
  heroPosterUrl: '/floor/alasas-logo.jpg',
  heroVideoEnabled: false,
  heroFullWidth: false,
  heroObjectPositionDesktop: 'center',
  heroObjectPositionTablet: 'center',
  heroObjectPositionMobile: 'center',
  featuredCategory: '',
  shopButtonUrl: '/shop',
  designButtonUrl: '/design-your-bouquet',
}

export const DEFAULT_AI_ASSISTANT_CONFIG: Record<string, unknown> = {
  enabled: true,
  welcomeMessage: 'هلا بيك! احچيلي عن الباقة اللي ببالك — المناسبة، الألوان، والميزانية إذا عندك.',
  packageOptions: ['باقة تخرج', 'ورد أحمر وأبيض', 'بحدود ٣٠ ألف'],
  handoffMessage: 'اقتراحات أولية حسب إعدادات المتجر',
  assistantAvatarUrl: '',
  assistantAvatarEnabled: true,
}

export const EMPTY_GIFT_CONFIG: GiftConfig = { flowerTypes: [], flowerColors: [], stemCounts: [], wrappings: [], wrappingColors: [], ribbons: [], addons: [], cards: [], occasions: [], settings: {} }

function optionList(value: unknown): BouquetOptionRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    if (item.enabled === false || typeof item.label !== 'string' || !Number.isInteger(item.price) || Number(item.price) < 0) return []
    return [{ id, label: item.label, labelEn: typeof item.labelEn === 'string' ? item.labelEn : undefined, price: Number(item.price), image: typeof item.image === 'string' ? item.image : undefined, enabled: true, order: Number.isInteger(item.order) ? Number(item.order) : 0 }]
  }).sort((a, b) => (a.order || 0) - (b.order || 0))
}

function addonList(value: unknown): GiftAddonRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    if (item.enabled === false || typeof item.name !== 'string' || !Number.isInteger(item.price) || Number(item.price) < 0) return []
    return [{ id, name: item.name, nameEn: typeof item.nameEn === 'string' ? item.nameEn : undefined, category: typeof item.category === 'string' ? item.category : undefined, price: Number(item.price), image: typeof item.image === 'string' ? item.image : undefined, stock: Number.isInteger(item.stock) ? Number(item.stock) : undefined, enabled: true, bouquetCompatible: item.bouquetCompatible !== false, order: Number.isInteger(item.order) ? Number(item.order) : 0 }]
  }).sort((a, b) => (a.order || 0) - (b.order || 0))
}

function cardList(value: unknown): GreetingCardTemplateRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    if (item.enabled === false || typeof item.text !== 'string' || item.text.length > 500 || !Number.isInteger(item.price) || Number(item.price) < 0) return []
    return [{ id, occasion: typeof item.occasion === 'string' ? item.occasion : undefined, text: item.text, price: Number(item.price), enabled: true, order: Number.isInteger(item.order) ? Number(item.order) : 0 }]
  }).sort((a, b) => (a.order || 0) - (b.order || 0))
}

export function subscribeToShopGiftConfig(shopId: string, onConfig: (config: GiftConfig) => void, onError: (error: Error) => void): Unsubscribe {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shopId)) throw new Error('Invalid shop ID')
  return onValue(ref(firebaseDatabase, `shops/${shopId}/public/gifting`), snapshot => {
    const value = snapshot.val() && typeof snapshot.val() === 'object' && !Array.isArray(snapshot.val()) ? snapshot.val() as Record<string, unknown> : {}
    onConfig({ flowerTypes: optionList(value.flowerTypes), flowerColors: optionList(value.flowerColors), stemCounts: optionList(value.stemCounts), wrappings: optionList(value.wrappings), wrappingColors: optionList(value.wrappingColors), ribbons: optionList(value.ribbons), addons: addonList(value.addons), cards: cardList(value.cards), occasions: optionList(value.occasions), settings: value.settings && typeof value.settings === 'object' && !Array.isArray(value.settings) ? value.settings as Record<string, unknown> : {} })
  }, onError)
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
        ...(typeof record.flowerType === 'string' ? { flowerType: record.flowerType } : {}),
        ...(Array.isArray(record.occasions) ? { occasions: record.occasions.filter((item): item is string => typeof item === 'string') } : {}),
        ...(record.featured === true ? { featured: true } : {}),
        ...(record.bestseller === true ? { bestseller: true } : {}),
        ...(record.isNew === true ? { isNew: true } : {}),
        ...(typeof record.status === 'string' ? { status: record.status } : {}),
        ...(typeof record.stock === 'number' ? { stock: record.stock } : {}),
        active: true,
      })
    }
    onProducts(products)
  }, error => onError(error))
}

/**
 * Watch the deliberately public demo projection. This is separate from the
 * private/admin product collection so a DRAFT product is never exposed just
 * because a customer can read the catalog.
 */
export function subscribeToShopDemoProducts(
  shopId: string,
  onProducts: (products: FlowerProductRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shopId)) throw new Error('Invalid shop ID')
  return onValue(ref(firebaseDatabase, `shops/${shopId}/public/demoProducts`), snapshot => {
    const value: unknown = snapshot.val()
    if (!value || typeof value !== 'object' || Array.isArray(value)) { onProducts([]); return }
    const products: FlowerProductRecord[] = []
    for (const [id, item] of Object.entries(value)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      if (record.demoTag !== 'ALASAS_DEMO_V1' || typeof record.name !== 'string' || typeof record.category !== 'string' || typeof record.price !== 'number' || !Number.isFinite(record.price)) continue
      if (['HIDDEN', 'ARCHIVED'].includes(String(record.status || '').toUpperCase())) continue
      products.push({ id, name: record.name, nameEn: typeof record.nameEn === 'string' ? record.nameEn : undefined, price: record.price, category: record.category, image: typeof record.image === 'string' ? record.image : undefined, imageUrls: Array.isArray(record.imageUrls) ? record.imageUrls.filter((item): item is string => typeof item === 'string') : undefined, description: typeof record.description === 'string' ? record.description : undefined, badge: 'منتج تجريبي', stock: typeof record.stock === 'number' ? record.stock : undefined, status: 'DEMO', active: false, orderable: false, demoTag: 'ALASAS_DEMO_V1', demo: true })
    }
    onProducts(products)
  }, onError)
}

export function subscribeToShopCategories(
  shopId: string,
  onCategories: (categories: FlowerCategoryRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let byStatus: Record<string, unknown> = {}
  let byVisibility: Record<string, unknown> = {}
  let closed = false
  const emit = () => {
    const value = { ...byVisibility, ...byStatus }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { onCategories([]); return }
    const categories: FlowerCategoryRecord[] = []
    for (const [id, item] of Object.entries(value)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      // Demo categories are a separate projection and must never be presented
      // as the store's published Production taxonomy.
      if (record.demoTag === 'ALASAS_DEMO_V1') continue
      if (typeof record.name !== 'string' || record.visible === false || ['HIDDEN', 'DRAFT', 'ARCHIVED'].includes(String(record.status || '').toUpperCase())) continue
      categories.push({ id, name: record.name, ...(typeof record.description === 'string' ? { description: record.description } : {}), ...(typeof record.image === 'string' ? { image: record.image } : {}), ...(Number.isInteger(record.order) ? { order: record.order as number } : {}), ...(typeof record.status === 'string' ? { status: record.status } : {}), visible: true })
    }
    categories.sort((a, b) => (a.order || 0) - (b.order || 0))
    onCategories(categories)
  }
  const statusQuery = query(ref(firebaseDatabase, `shops/${shopId}/public/categories`), orderByChild('status'), equalTo('PUBLISHED'))
  const visibleQuery = query(ref(firebaseDatabase, `shops/${shopId}/public/categories`), orderByChild('visible'), equalTo(true))
  const stopStatus = onValue(statusQuery, snapshot => { byStatus = snapshot.val() || {}; if (!closed) emit() }, onError)
  const stopVisibility = onValue(visibleQuery, snapshot => { byVisibility = snapshot.val() || {}; if (!closed) emit() }, onError)
  return () => { closed = true; stopStatus(); stopVisibility() }
}

export function subscribeToShopPublicConfig(
  shopId: string,
  onConfig: (config: ShopPublicConfig) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let value: Record<string, unknown> = {}
  const emit = () => {
    const objectValue = (candidate: unknown): Record<string, unknown> => candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {}
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
          if (Number.isInteger(areaRecord.price) && (areaRecord.price as number) >= 0 && areaRecord.enabled !== false) normalizedAreas[district] = {
            price: areaRecord.price as number,
            ...(typeof areaRecord.deliveryAt === 'string' ? { deliveryAt: areaRecord.deliveryAt } : {}),
            ...(Array.isArray(areaRecord.availableDays) ? { availableDays: areaRecord.availableDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) } : {}),
            ...(Array.isArray(areaRecord.timeSlots) ? { timeSlots: areaRecord.timeSlots.filter((slot): slot is string => typeof slot === 'string' && slot.length <= 80) } : {}),
            ...(Number.isInteger(areaRecord.preparationHours) && (areaRecord.preparationHours as number) >= 0 ? { preparationHours: areaRecord.preparationHours as number } : {}),
            ...(Array.isArray(areaRecord.preorderDates) ? { preorderDates: areaRecord.preorderDates.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) } : {}),
          }
        }
        delivery[province] = { enabled: record.enabled !== false, areas: normalizedAreas }
      }
    }
    const aiAssistant = objectValue(value.aiAssistant)
    if (typeof aiAssistant.packageOptions === 'string') aiAssistant.packageOptions = aiAssistant.packageOptions.split(',').map(item => item.trim()).filter(Boolean)
    onConfig({ paymentMethods, delivery, settings: objectValue(value.settings), homepage: { ...DEFAULT_HOMEPAGE_CONFIG, ...objectValue(value.homepage) }, aiAssistant: { ...DEFAULT_AI_ASSISTANT_CONFIG, ...aiAssistant } })
  }
  const stops = ['paymentMethods', 'delivery', 'settings', 'homepage', 'aiAssistant'].map(key => onValue(ref(firebaseDatabase, `shops/${shopId}/public/${key}`), snapshot => { const next = snapshot.val(); value = { ...value, [key]: next && typeof next === 'object' && !Array.isArray(next) ? next as Record<string, unknown> : {} }; emit() }, onError))
  return () => stops.forEach(stop => stop())
}
