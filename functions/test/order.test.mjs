import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrder, canTransitionOrderStatus, normalizeOrderInput } from '../src/order.js'

const input = {
  items: [{ productId: 'red', quantity: 2 }],
  customerName: 'Test Customer', phone: '07700000000', recipientName: 'Recipient', recipientPhone: '07700000001',
  province: 'Najaf', district: 'University', address: 'Test address', deliveryAt: '2026-10-20T12:00',
  giftMessage: 'Hello', paymentMethodId: 'cash', transferReference: '', idempotencyKey: 'qa-order-1',
}

test('normalizes and prices from Firebase catalog values', () => {
  const result = calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true, status: 'PUBLISHED', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } })
  assert.equal(result.subtotal, 70000)
  assert.equal(result.deliveryFee, 5000)
  assert.equal(result.total, 75000)
  assert.equal(result.paymentStatus, undefined)
  assert.equal(result.items[0].unitPrice, 35000)
})

test('rejects duplicate products and unconfigured delivery', () => {
  assert.throws(() => normalizeOrderInput({ ...input, items: [{ productId: 'red', quantity: 1 }, { productId: 'red', quantity: 1 }] }), /DUPLICATE_PRODUCT/)
  assert.throws(() => normalizeOrderInput({ ...input, idempotencyKey: '../orders' }), /INVALID_IDEMPOTENCY_KEY/)
  assert.throws(() => calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true, status: 'PUBLISHED' } }, {}, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /DELIVERY_AREA_UNCONFIGURED/)
  assert.throws(() => calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true, status: 'PUBLISHED' } }, { Najaf: { areas: { University: { price: 5000, enabled: false } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /DELIVERY_AREA_UNCONFIGURED/)
  assert.throws(() => calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true, status: 'PUBLISHED' } }, { Najaf: { enabled: false, areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /DELIVERY_AREA_UNCONFIGURED/)
})

test('rejects stale client price because item price is read from catalog', () => {
  const result = calculateOrder({ ...input, clientTotal: 1 }, { red: { name: 'Red bouquet', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } })
  assert.equal(result.total, 85000)
})

test('enforces store closure and payment province restrictions on the server', () => {
  const products = { red: { name: 'Red bouquet', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }
  const delivery = { Najaf: { areas: { University: { price: 5000 } } } }
  const payment = { cash: { name: 'Cash', type: 'CASH', enabled: true, provinces: ['Baghdad'] } }
  assert.throws(() => calculateOrder(input, products, delivery, payment), /PAYMENT_METHOD_UNAVAILABLE/)
  assert.throws(() => calculateOrder({ ...input, province: 'Baghdad', district: 'University' }, products, { Baghdad: { areas: { University: { price: 5000 } } } }, payment, {}, { acceptingOrders: false }), /ORDERS_CLOSED/)
})

test('applies one eligible percentage coupon from server data', () => {
  const result = calculateOrder({ ...input, couponCode: 'SPRING10' }, { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }, { spring: { name: 'Spring', code: 'SPRING10', scope: 'ALL', discountType: 'PERCENT', value: 10, active: true } })
  assert.equal(result.subtotal, 80000)
  assert.equal(result.discount, 8000)
  assert.equal(result.total, 77000)
  assert.equal(result.discountDetail.id, 'spring')
})

test('applies an eligible automatic promotion when no coupon code is entered', () => {
  const result = calculateOrder(input, { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }, { automatic: { name: 'Automatic roses offer', code: '', scope: 'CATEGORY', categoryId: 'roses', discountType: 'PERCENT', value: 10, active: true } })
  assert.equal(result.discount, 8000)
  assert.equal(result.total, 77000)
  assert.equal(result.discountDetail.code, '')
})

test('does not apply expired or below-minimum discounts', () => {
  const base = { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }
  const delivery = { Najaf: { areas: { University: { price: 5000 } } } }
  const payment = { cash: { name: 'Cash', type: 'CASH', enabled: true } }
  const discounts = { expired: { code: 'OLD', discountType: 'FIXED', value: 10000, endsAt: '2020-01-01', active: true }, minimum: { code: 'MIN', discountType: 'FIXED', value: 10000, minOrderTotal: 100000, active: true } }
  assert.throws(() => calculateOrder({ ...input, couponCode: 'OLD' }, base, delivery, payment, discounts), /DISCOUNT_UNAVAILABLE/)
  assert.throws(() => calculateOrder({ ...input, couponCode: 'MIN' }, base, delivery, payment, discounts), /DISCOUNT_UNAVAILABLE/)
})

test('applies a capped fixed category discount from server data', () => {
  const result = calculateOrder({ ...input, couponCode: 'ROSES5' }, { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, status: 'PUBLISHED', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }, { roses: { name: 'Roses offer', code: 'ROSES5', scope: 'CATEGORY', categoryId: 'roses', discountType: 'FIXED', value: 12000, maxDiscount: 5000, active: true } })
  assert.equal(result.discount, 5000)
  assert.equal(result.total, 80000)
})

test('rejects an unavailable product state', () => {
  assert.throws(() => calculateOrder(input, { red: { name: 'Archived bouquet', price: 40000, active: true, status: 'UNAVAILABLE', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /PRODUCT_UNAVAILABLE/)
})

test('requires an explicit published state for checkout', () => {
  assert.throws(() => calculateOrder(input, { red: { name: 'Unreviewed bouquet', price: 40000, active: true, stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /PRODUCT_UNAVAILABLE/)
})

test('rejects the current DEMO records while they remain draft and inactive', () => {
  assert.throws(() => calculateOrder(input, { red: { name: 'Demo bouquet', price: 40000, active: false, status: 'DRAFT', demoTag: 'ALASAS_DEMO_V1', stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /PRODUCT_UNAVAILABLE/)
})

test('rejects a DEMO record even if a client falsely marks it published', () => {
  assert.throws(() => calculateOrder(input, { red: { name: 'Demo bouquet', price: 40000, active: true, status: 'PUBLISHED', demoTag: 'ALASAS_DEMO_V1', orderable: true } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /PRODUCT_UNAVAILABLE/)
})

test('enforces the order status state machine', () => {
  assert.equal(canTransitionOrderStatus('NEW', 'PAYMENT_REVIEW'), true)
  assert.equal(canTransitionOrderStatus('PAYMENT_CONFIRMED', 'APPROVED'), true)
  assert.equal(canTransitionOrderStatus('APPROVED', 'PREPARING'), true)
  assert.equal(canTransitionOrderStatus('NEW', 'DELIVERED'), false)
  assert.equal(canTransitionOrderStatus('PREPARING', 'APPROVED'), false)
  assert.equal(canTransitionOrderStatus('APPROVED', 'CANCELLED'), false)
  assert.equal(canTransitionOrderStatus('DELIVERED', 'CANCELLED'), false)
})

test('persists sanitized cart options without trusting them for price', () => {
  const result = calculateOrder({ ...input, items: [{ productId: 'red', quantity: 1, packaging: 'Premium wrap', packagingColor: 'أوف وايت', addOns: ['Ribbon', 'Unlisted'], giftMessage: 'Happy day' }] }, { red: { name: 'Red bouquet', price: 40000, active: true, status: 'PUBLISHED', stock: 3, packaging: 'Standard wrap', addOns: ['Ribbon', 'Card'] } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } })
  assert.equal(result.total, 45000)
  assert.equal(result.items[0].packaging, 'Premium wrap')
  assert.equal(result.items[0].packagingColor, 'أوف وايت')
  assert.deepEqual(result.items[0].addOns, ['Ribbon'])
  assert.equal(result.items[0].giftMessage, 'Happy day')
})
