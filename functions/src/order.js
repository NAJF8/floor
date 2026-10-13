export const SHOP_ID = 'floor-232bc'

const MAX_ITEMS = 40
const MAX_QUANTITY = 99

export function text(value, field, max = 240) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new Error(`INVALID_${field.toUpperCase()}`)
  }
  return value.trim()
}

export function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`INVALID_${field.toUpperCase()}`)
  return value
}

export function normalizeOrderInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_ORDER')
  const rawItems = input.items
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) throw new Error('INVALID_ITEMS')
  const seen = new Set()
  const items = rawItems.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('INVALID_ITEM')
    const productId = text(item.productId, 'product_id', 80)
    if (seen.has(productId)) throw new Error('DUPLICATE_PRODUCT')
    seen.add(productId)
    return { productId, quantity: integer(item.quantity, 'quantity', { min: 1, max: MAX_QUANTITY }) }
  })
  return {
    items,
    customerName: text(input.customerName, 'customer_name', 120),
    phone: text(input.phone, 'phone', 40),
    recipientName: text(input.recipientName, 'recipient_name', 120),
    recipientPhone: text(input.recipientPhone, 'recipient_phone', 40),
    province: text(input.province, 'province', 100),
    district: text(input.district, 'district', 120),
    address: text(input.address, 'address', 300),
    deliveryAt: text(input.deliveryAt, 'delivery_at', 80),
    giftMessage: typeof input.giftMessage === 'string' ? input.giftMessage.trim().slice(0, 500) : '',
    couponCode: typeof input.couponCode === 'string' ? input.couponCode.trim().toUpperCase().slice(0, 80) : '',
    paymentMethodId: text(input.paymentMethodId, 'payment_method_id', 100),
    transferReference: typeof input.transferReference === 'string' ? input.transferReference.trim().slice(0, 120) : '',
    idempotencyKey: text(input.idempotencyKey, 'idempotency_key', 120),
  }
}

function productIsPublished(product) {
  return product && typeof product === 'object' && !Array.isArray(product) && product.active !== false && product.status !== 'ARCHIVED' && product.status !== 'HIDDEN' && product.status !== 'DRAFT' && product.status !== 'UNAVAILABLE'
}

function normalizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return {}
  return Object.fromEntries(Object.entries(recipe)
    .filter(([materialId, quantity]) => typeof materialId === 'string' && materialId.length > 0 && Number.isInteger(quantity) && quantity > 0)
    .map(([materialId, quantity]) => [materialId, quantity]))
}

function findDeliveryArea(delivery, province, district) {
  const provinceRecord = delivery?.[province]
  const areas = provinceRecord?.areas || provinceRecord?.districts || provinceRecord
  const area = areas?.[district]
  return area && typeof area === 'object' && Number.isInteger(area.price) && area.price >= 0 ? area : null
}

function timestamp(value) {
  if (Number.isInteger(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function discountIsActive(discount, now) {
  if (!discount || typeof discount !== 'object' || Array.isArray(discount) || discount.active === false || discount.status === 'ARCHIVED' || discount.status === 'DRAFT') return false
  const start = timestamp(discount.startsAt ?? discount.startDate)
  const end = timestamp(discount.endsAt ?? discount.endDate)
  return (!start || now >= start) && (!end || now <= end)
}

function discountAmount(discount, items, products, subtotal, couponCode, now) {
  if (!discountIsActive(discount, now)) return null
  const code = typeof discount.code === 'string' ? discount.code.trim().toUpperCase() : ''
  if (code !== couponCode) return null
  if (Number.isInteger(discount.maxUses) && Number(discount.usageCount || 0) >= discount.maxUses) return null
  if (Number.isInteger(discount.minOrderTotal) && subtotal < discount.minOrderTotal) return null
  const scope = String(discount.scope || discount.appliesTo || 'ALL').toUpperCase()
  const base = items.reduce((sum, item) => {
    const product = products?.[item.productId]
    const productMatch = scope === 'PRODUCT' ? (discount.productId === item.productId) : scope === 'CATEGORY' ? (discount.categoryId === product?.category || discount.category === product?.category) : true
    return productMatch ? sum + item.lineTotal : sum
  }, 0)
  if (base <= 0) return null
  const kind = String(discount.discountType || discount.mode || (Number.isFinite(discount.percent) ? 'PERCENT' : 'FIXED')).toUpperCase()
  const value = Number(discount.value ?? (kind === 'PERCENT' ? discount.percent : discount.amount))
  if (!Number.isFinite(value) || value < 0) return null
  let amount = kind === 'PERCENT' ? Math.floor(base * Math.min(value, 100) / 100) : Math.floor(value)
  if (Number.isInteger(discount.maxDiscount)) amount = Math.min(amount, discount.maxDiscount)
  amount = Math.min(amount, base)
  return amount > 0 ? { id: discount.id, name: typeof discount.name === 'string' ? discount.name : '', code, amount } : null
}

export function calculateOrder(input, products, delivery, paymentMethods, discounts = {}) {
  const normalized = normalizeOrderInput(input)
  const resolvedItems = normalized.items.map(({ productId, quantity }) => {
    const product = products?.[productId]
    if (!productIsPublished(product) || !Number.isInteger(product.price) || product.price < 0) throw new Error('PRODUCT_UNAVAILABLE')
    if (Number.isInteger(product.stock) && product.stock < quantity) throw new Error('INSUFFICIENT_STOCK')
    return {
      productId,
      name: text(product.name, 'product_name', 200),
      category: typeof product.category === 'string' ? product.category : '',
      quantity,
      unitPrice: product.price,
      image: typeof product.image === 'string' ? product.image : Array.isArray(product.imageUrls) && typeof product.imageUrls[0] === 'string' ? product.imageUrls[0] : '',
      inventoryRecipe: normalizeRecipe(product.inventoryRecipe || product.recipe),
      lineTotal: product.price * quantity,
    }
  })
  const paymentMethod = paymentMethods?.[normalized.paymentMethodId]
  if (!paymentMethod || paymentMethod.enabled !== true) throw new Error('PAYMENT_METHOD_UNAVAILABLE')
  const deliveryArea = findDeliveryArea(delivery, normalized.province, normalized.district)
  if (!deliveryArea) throw new Error('DELIVERY_AREA_UNCONFIGURED')
  const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const now = Date.now()
  const candidates = Object.entries(discounts || {}).map(([id, discount]) => discountAmount({ ...(discount || {}), id }, resolvedItems, products, subtotal, normalized.couponCode, now)).filter(Boolean)
  const selectedDiscount = candidates.sort((a, b) => b.amount - a.amount)[0] || null
  if (normalized.couponCode && !selectedDiscount) throw new Error('DISCOUNT_UNAVAILABLE')
  const discount = selectedDiscount?.amount || 0
  const deliveryFee = deliveryArea.price
  return {
    ...normalized,
    items: resolvedItems,
    subtotal,
    discount,
    discountDetail: selectedDiscount,
    deliveryFee,
    total: subtotal - discount + deliveryFee,
    paymentMethod: { id: normalized.paymentMethodId, name: text(paymentMethod.name, 'payment_method_name', 120), type: typeof paymentMethod.type === 'string' ? paymentMethod.type : 'OTHER' },
  }
}
