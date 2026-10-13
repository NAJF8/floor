import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrder, normalizeOrderInput } from '../src/order.js'

const input = {
  items: [{ productId: 'red', quantity: 2 }],
  customerName: 'Test Customer', phone: '07700000000', recipientName: 'Recipient', recipientPhone: '07700000001',
  province: 'Najaf', district: 'University', address: 'Test address', deliveryAt: '2026-10-20T12:00',
  giftMessage: 'Hello', paymentMethodId: 'cash', transferReference: '', idempotencyKey: 'qa-order-1',
}

test('normalizes and prices from Firebase catalog values', () => {
  const result = calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true, stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } })
  assert.equal(result.subtotal, 70000)
  assert.equal(result.deliveryFee, 5000)
  assert.equal(result.total, 75000)
  assert.equal(result.paymentStatus, undefined)
  assert.equal(result.items[0].unitPrice, 35000)
})

test('rejects duplicate products and unconfigured delivery', () => {
  assert.throws(() => normalizeOrderInput({ ...input, items: [{ productId: 'red', quantity: 1 }, { productId: 'red', quantity: 1 }] }), /DUPLICATE_PRODUCT/)
  assert.throws(() => calculateOrder(input, { red: { name: 'Red bouquet', price: 35000, active: true } }, {}, { cash: { name: 'Cash', type: 'CASH', enabled: true } }), /DELIVERY_AREA_UNCONFIGURED/)
})

test('rejects stale client price because item price is read from catalog', () => {
  const result = calculateOrder({ ...input, clientTotal: 1 }, { red: { name: 'Red bouquet', price: 40000, active: true, stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } })
  assert.equal(result.total, 85000)
})

test('applies one eligible percentage coupon from server data', () => {
  const result = calculateOrder({ ...input, couponCode: 'SPRING10' }, { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, stock: 3 } }, { Najaf: { areas: { University: { price: 5000 } } } }, { cash: { name: 'Cash', type: 'CASH', enabled: true } }, { spring: { name: 'Spring', code: 'SPRING10', scope: 'ALL', discountType: 'PERCENT', value: 10, active: true } })
  assert.equal(result.subtotal, 80000)
  assert.equal(result.discount, 8000)
  assert.equal(result.total, 77000)
  assert.equal(result.discountDetail.id, 'spring')
})

test('does not apply expired or below-minimum discounts', () => {
  const base = { red: { name: 'Red bouquet', category: 'roses', price: 40000, active: true, stock: 3 } }
  const delivery = { Najaf: { areas: { University: { price: 5000 } } } }
  const payment = { cash: { name: 'Cash', type: 'CASH', enabled: true } }
  const discounts = { expired: { code: 'OLD', discountType: 'FIXED', value: 10000, endsAt: '2020-01-01', active: true }, minimum: { code: 'MIN', discountType: 'FIXED', value: 10000, minOrderTotal: 100000, active: true } }
  assert.throws(() => calculateOrder({ ...input, couponCode: 'OLD' }, base, delivery, payment, discounts), /DISCOUNT_UNAVAILABLE/)
  assert.throws(() => calculateOrder({ ...input, couponCode: 'MIN' }, base, delivery, payment, discounts), /DISCOUNT_UNAVAILABLE/)
})
