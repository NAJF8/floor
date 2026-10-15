function collection(config, key) {
  const value = config?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function activeOption(config, key, id) {
  if (!id) return null
  const item = collection(config, key)[id]
  if (!item || item.enabled === false || !Number.isInteger(item.price) || item.price < 0) throw new Error('GIFTING_OPTION_UNAVAILABLE')
  if (Number.isInteger(item.stock) && item.stock <= 0) throw new Error('GIFTING_OPTION_OUT_OF_STOCK')
  return { id, price: item.price, label: item.label || item.name || item.text || id }
}
export function calculateGiftingTotal({ config, product, optionIds = {}, addonIds = [], cardId = '', deliveryFee = 0 }) {
  if (!product || product.status !== 'PUBLISHED' || product.active === false || !Number.isInteger(product.price) || product.price < 0) throw new Error('PRODUCT_UNAVAILABLE')
  if (!Number.isInteger(deliveryFee) || deliveryFee < 0) throw new Error('INVALID_DELIVERY_FEE')
  const components = [product.price]
  for (const [key, id] of Object.entries(optionIds)) { const option = activeOption(config, key, id); if (option) components.push(option.price) }
  for (const id of addonIds) { const addon = activeOption(config, 'addons', id); if (addon) components.push(addon.price) }
  const card = activeOption(config, 'cards', cardId)
  if (card) components.push(card.price)
  return { total: components.reduce((sum, value) => sum + value, deliveryFee), product: product.price, customization: components.slice(1).reduce((sum, value) => sum + value, 0), deliveryFee }
}
export function deliveryIsAvailable(area, deliveryAt) {
  if (!area || area.enabled === false || !Number.isInteger(area.price) || area.price < 0 || typeof deliveryAt !== 'string') return false
  const date = new Date(deliveryAt)
  if (Number.isNaN(date.getTime())) return false
  if (Array.isArray(area.availableDays) && area.availableDays.length && !area.availableDays.includes(date.getDay())) return false
  if (Array.isArray(area.timeSlots) && area.timeSlots.length) { const time = deliveryAt.slice(11, 16); if (!area.timeSlots.some(slot => { const [start, end] = String(slot).split('-'); return start && end && time >= start && time <= end })) return false }
  return true
}
