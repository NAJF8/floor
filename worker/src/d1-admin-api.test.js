import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createD1OrderRepository, seedInventoryToD1, syncCatalogToD1 } from './d1-order-engine.js'
import { createD1AdminApi } from './d1-admin-api.js'

function d1(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() { return db.prepare(sql).get(...params) || null },
            async all() { return { results: db.prepare(sql).all(...params) } },
            async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: Number(result.changes) } } },
          }
        },
      }
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}

async function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0001_order_engine.sql', import.meta.url), 'utf8'))
  const api = d1(db)
  await syncCatalogToD1(api, { version: 1, sourceUpdatedAt: 1, products: [{ productId: 'p1', name: 'Product', category: 'c', price: 1000, status: 'PUBLISHED', active: true, orderable: true }] })
  await seedInventoryToD1(api, { inventory: [{ productId: 'p1', availableQuantity: 2 }] })
  db.prepare('INSERT INTO delivery_areas VALUES (?,?,?,?,?)').run('floor-232bc', 'Baghdad', 'Mansour', 0, 1)
  db.prepare('INSERT INTO payment_methods VALUES (?,?,?,?,?)').run('floor-232bc', 'cash', 'Cash', 'CASH', 1)
  db.prepare('INSERT INTO store_settings VALUES (?,?,?)').run('floor-232bc', 1, 0)
  const orders = createD1OrderRepository(api, { createId: (() => { let n = 0; return () => `id-${++n}` })() })
  const input = key => ({ items: [{ productId: 'p1', quantity: 1 }], customerName: 'A', phone: '1', recipientName: 'B', recipientPhone: '2', province: 'Baghdad', district: 'Mansour', address: 'x', deliveryAt: 'now', paymentMethodId: 'cash', idempotencyKey: key })
  return { db, api: createD1AdminApi(api), orders, input }
}

test('ADMIN_AUTH and ADMIN_ORDER_UPDATE', async () => {
  const { api, orders, input } = await setup()
  const order = await orders.createOrder({ uid: 'customer', input: input('admin') })
  await assert.rejects(api.listOrders({ claims: { uid: 'viewer', role: 'VIEWER' } }).then(() => api.updateStatus({ claims: { uid: 'viewer', role: 'VIEWER' }, orderId: order.orderId, nextStatus: 'PREPARING' })), /ADMIN_PERMISSION_DENIED/)
  await assert.rejects(api.listOrders({ claims: { uid: 'viewer', role: 'VIEWER', permissions: { orders: false } } }), /ADMIN_PERMISSION_DENIED/)
  const result = await api.updateStatus({ claims: { uid: 'manager', role: 'MANAGER' }, orderId: order.orderId, nextStatus: 'AWAITING_PAYMENT' })
  assert.equal(result.status, 'AWAITING_PAYMENT')
  assert.equal((await api.getOrder({ claims: { uid: 'viewer', role: 'VIEWER' }, orderId: order.orderId })).order.status, 'AWAITING_PAYMENT')
})

test('ORDER_CANCEL_STOCK_RESTORE', async () => {
  const { db, api, orders, input } = await setup()
  const order = await orders.createOrder({ uid: 'customer', input: input('cancel') })
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('p1').available_quantity, 1)
  const result = await api.cancelOrder({ claims: { uid: 'manager', role: 'MANAGER' }, orderId: order.orderId })
  assert.equal(result.stockRestored, true)
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('p1').available_quantity, 2)
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE movement_type='ORDER_RELEASED'").get().count, 1)
  assert.equal((await api.cancelOrder({ claims: { uid: 'manager', role: 'MANAGER' }, orderId: order.orderId })).reused, true)
})
