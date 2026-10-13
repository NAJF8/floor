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
    paymentMethodId: text(input.paymentMethodId, 'payment_method_id', 100),
    transferReference: typeof input.transferReference === 'string' ? input.transferReference.trim().slice(0, 120) : '',
    idempotencyKey: text(input.idempotencyKey, 'idempotency_key', 120),
  }
}

function productIsPublished(product) {
  return product && typeof product === 'object' && !Array.isArray(product) && product.active !== false && product.status !== 'ARCHIVED' && product.status !== 'HIDDEN' && product.status !== 'DRAFT'
}

function findDeliveryArea(delivery, province, district) {
  const provinceRecord = delivery?.[province]
  const areas = provinceRecord?.areas || provinceRecord?.districts || provinceRecord
  const area = areas?.[district]
  return area && typeof area === 'object' && Number.isInteger(area.price) && area.price >= 0 ? area : null
}

export function calculateOrder(input, products, delivery, paymentMethods) {
  const normalized = normalizeOrderInput(input)
  const resolvedItems = normalized.items.map(({ productId, quantity }) => {
    const product = products?.[productId]
    if (!productIsPublished(product) || !Number.isInteger(product.price) || product.price < 0) throw new Error('PRODUCT_UNAVAILABLE')
    if (Number.isInteger(product.stock) && product.stock < quantity) throw new Error('INSUFFICIENT_STOCK')
    return {
      productId,
      name: text(product.name, 'product_name', 200),
      quantity,
      unitPrice: product.price,
      image: typeof product.image === 'string' ? product.image : Array.isArray(product.imageUrls) && typeof product.imageUrls[0] === 'string' ? product.imageUrls[0] : '',
      lineTotal: product.price * quantity,
    }
  })
  const paymentMethod = paymentMethods?.[normalized.paymentMethodId]
  if (!paymentMethod || paymentMethod.enabled !== true) throw new Error('PAYMENT_METHOD_UNAVAILABLE')
  const deliveryArea = findDeliveryArea(delivery, normalized.province, normalized.district)
  if (!deliveryArea) throw new Error('DELIVERY_AREA_UNCONFIGURED')
  const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const deliveryFee = deliveryArea.price
  return {
    ...normalized,
    items: resolvedItems,
    subtotal,
    discount: 0,
    deliveryFee,
    total: subtotal + deliveryFee,
    paymentMethod: { id: normalized.paymentMethodId, name: text(paymentMethod.name, 'payment_method_name', 120), type: typeof paymentMethod.type === 'string' ? paymentMethod.type : 'OTHER' },
  }
}
