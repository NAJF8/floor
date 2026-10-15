import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createD1OrderRepository, seedInventoryToD1, syncCatalogToD1 } from '../src/d1-order-engine.js'
import { createD1AdminApi } from '../src/d1-admin-api.js'

const sqlitePath = process.env.D1_LOCAL_SQLITE_PATH

function d1(db) {
  let transactionTail = Promise.resolve()
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
      const run = transactionTail.then(async () => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const results = []
          for (const statement of statements) results.push(await statement.run())
          db.exec('COMMIT')
          return results
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      })
      transactionTail = run.catch(() => undefined)
      return run
    },
  }
}

const input = key => ({ items: [{ productId: 'real-local', quantity: 1 }], customerName: 'Local Fixture', phone: '07000000000', recipientName: 'Recipient', recipientPhone: '07000000001', province: 'Baghdad', district: 'Mansour', address: 'Local only', deliveryAt: 'Tomorrow', paymentMethodId: 'cash', idempotencyKey: key })

test('D1_REAL_TRANSACTIONS: ten concurrent orders, idempotency, rollback, and cancel are safe', { skip: !sqlitePath }, async () => {
  const db = new DatabaseSync(sqlitePath)
  const api = d1(db)
  for (const table of ['order_events', 'inventory_movements', 'order_items', 'idempotency_keys', 'orders', 'transaction_guards', 'inventory', 'catalog_products', 'delivery_areas', 'payment_methods', 'store_settings', 'catalog_versions']) db.prepare(`DELETE FROM ${table}`).run()
  await syncCatalogToD1(api, { version: 1, sourceUpdatedAt: 1, products: [{ productId: 'real-local', name: 'Real Local', category: 'test', price: 1000, status: 'PUBLISHED', active: true, orderable: true }] })
  await seedInventoryToD1(api, { inventory: [{ productId: 'real-local', availableQuantity: 3 }] })
  db.prepare('INSERT INTO delivery_areas VALUES (?,?,?,?,?)').run('floor-232bc', 'Baghdad', 'Mansour', 0, 1)
  db.prepare('INSERT INTO payment_methods VALUES (?,?,?,?,?)').run('floor-232bc', 'cash', 'Cash', 'CASH', 1)
  db.prepare('INSERT INTO store_settings VALUES (?,?,?)').run('floor-232bc', 1, 0)
  let sequence = 0
  const orders = createD1OrderRepository(api, { createId: () => `local-${++sequence}` })
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => orders.createOrder({ uid: `local-user-${index}`, input: input(`local-key-${index}`) })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3)
  assert.equal(results.filter(result => result.status === 'rejected').length, 7)
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('real-local').available_quantity, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 3)
  assert.equal(db.prepare('SELECT MIN(available_quantity) AS minimum FROM inventory').get().minimum, 0)

  const first = results.find(result => result.status === 'fulfilled').value
  const repeated = await orders.createOrder({ uid: 'local-user-0', input: input('local-key-0') })
  assert.equal(repeated.reused, true)
  assert.equal(repeated.orderId, first.orderId)

  await assert.rejects(orders.createOrder({ uid: 'rollback-user', input: input('rollback-key') }), /INSUFFICIENT_STOCK/)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM idempotency_keys WHERE idempotency_key=?').get('rollback-key').count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM transaction_guards').get().count, 0)

  const admin = createD1AdminApi(api)
  const cancelled = await admin.cancelOrder({ claims: { uid: 'manager', role: 'MANAGER' }, orderId: first.orderId })
  assert.equal(cancelled.stockRestored, true)
  assert.equal((await admin.cancelOrder({ claims: { uid: 'manager', role: 'MANAGER' }, orderId: first.orderId })).reused, true)
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('real-local').available_quantity, 1)
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE order_id=? AND movement_type='ORDER_RELEASED'").get(first.orderId).count, 1)
  db.close()
})

test('D1_REAL_TRANSACTIONS requires a Wrangler-persisted database path', { skip: Boolean(sqlitePath) }, () => {
  assert.fail('Set D1_LOCAL_SQLITE_PATH to a Wrangler local D1 sqlite file')
})
