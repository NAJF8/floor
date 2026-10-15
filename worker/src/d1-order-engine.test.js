import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createD1OrderRepository, seedInventoryToD1, syncCatalogToD1 } from './d1-order-engine.js'

function d1(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() { return db.prepare(sql).get(...params) || null },
            async all() { return { results: db.prepare(sql).all(...params), meta: { changes: 0 } } },
            async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } } },
          }
        },
      }
    },
    async batch(statements) {
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
    },
  }
}

async function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0001_order_engine.sql', import.meta.url), 'utf8'))
  const api = d1(db)
  await syncCatalogToD1(api, { version: 1, sourceUpdatedAt: 1700000000000, products: [{ productId: 'real-rose', name: 'Real Rose', category: 'roses', price: 25000, status: 'PUBLISHED', active: true, orderable: true }] })
  await seedInventoryToD1(api, { inventory: [{ productId: 'real-rose', availableQuantity: 1 }] })
  db.prepare('INSERT INTO delivery_areas VALUES (?, ?, ?, ?, ?)').run('floor-232bc', 'Baghdad', 'Mansour', 5000, 1)
  db.prepare('INSERT INTO payment_methods VALUES (?, ?, ?, ?, ?)').run('floor-232bc', 'cash', 'Cash', 'CASH', 1)
  db.prepare('INSERT INTO store_settings VALUES (?, ?, ?)').run('floor-232bc', 1, 0)
  return { db, api: createD1OrderRepository(api, { createId: (() => { let n = 0; return () => `fixture-${++n}` })() }) }
}

const orderInput = (key = 'key-1', overrides = {}) => ({ items: [{ productId: 'real-rose', quantity: 1 }], customerName: 'Fixture', phone: '07000000000', recipientName: 'Recipient', recipientPhone: '07000000001', province: 'Baghdad', district: 'Mansour', address: 'Address', deliveryAt: 'Tomorrow', paymentMethodId: 'cash', idempotencyKey: key, ...overrides })

test('D1_SCHEMA and D1_MIGRATIONS', async () => {
  const { db } = await fixture()
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
  for (const table of ['orders', 'order_items', 'inventory', 'inventory_movements', 'idempotency_keys', 'order_events', 'catalog_versions']) assert.ok(tables.includes(table), table)
})

test('VALID_ORDER_CREATE and PRICE_TAMPERING_REJECTED', async () => {
  const { db, api } = await fixture()
  const result = await api.createOrder({ uid: 'customer-1', input: orderInput('valid', { items: [{ productId: 'real-rose', quantity: 1, price: 1, lineTotal: 1 }] }) })
  assert.equal(result.reused, false)
  assert.equal(result.total, 30000)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_items').get().count, 1)
})

for (const state of [{ demoTag: 'ALASAS_DEMO_V1' }, { status: 'DRAFT' }, { status: 'HIDDEN' }, { status: 'ARCHIVED' }, { active: false }, { orderable: false }]) test(`DEMO_DRAFT_HIDDEN_REJECTED_${JSON.stringify(state)}`, async () => {
  const { db, api } = await fixture()
  db.prepare('UPDATE catalog_products SET demo_tag=COALESCE(?, demo_tag), status=COALESCE(?, status), active=COALESCE(?, active), orderable=COALESCE(?, orderable) WHERE product_id=?').run(state.demoTag || null, state.status || null, state.active === undefined ? null : (state.active ? 1 : 0), state.orderable === undefined ? null : (state.orderable ? 1 : 0), 'real-rose')
  await assert.rejects(api.createOrder({ uid: 'customer-1', input: orderInput('blocked') }), error => ['DEMO_ORDER_REJECTED', 'PRODUCT_UNAVAILABLE'].includes(error.message))
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0)
})

test('STOCK_ATOMICITY and TRANSACTION_ROLLBACK', async () => {
  const { db, api } = await fixture()
  await assert.rejects(api.createOrder({ uid: 'customer-1', input: orderInput('too-many', { items: [{ productId: 'real-rose', quantity: 2 }] }) }), /INSUFFICIENT_STOCK|TRANSACTION/)
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('real-rose').available_quantity, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM idempotency_keys').get().count, 0)
})

test('CONCURRENT_LAST_ITEM allows only one different request', async () => {
  const { db, api } = await fixture()
  const results = await Promise.allSettled([api.createOrder({ uid: 'a', input: orderInput('a') }), api.createOrder({ uid: 'b', input: orderInput('b') })])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.filter(item => item.status === 'rejected').length, 1)
  assert.equal(db.prepare('SELECT available_quantity FROM inventory WHERE product_id=?').get('real-rose').available_quantity, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1)
})

test('IDEMPOTENCY_RETRY returns the existing order', async () => {
  const { db, api } = await fixture()
  const first = await api.createOrder({ uid: 'customer-1', input: orderInput('same') })
  const second = await api.createOrder({ uid: 'customer-1', input: orderInput('same') })
  assert.equal(second.reused, true)
  assert.equal(second.orderId, first.orderId)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1)
})

test('INVALID_DELIVERY_REJECTED', async () => {
  const { api } = await fixture()
  await assert.rejects(api.createOrder({ uid: 'customer-1', input: orderInput('bad-delivery', { district: 'Unknown' }) }), /INVALID_DELIVERY/)
})

test('CATALOG_SYNC and CATALOG_VERSION_CONFLICT', async () => {
  const { db } = await fixture()
  const api = d1(db)
  await assert.rejects(syncCatalogToD1(api, { version: 2, expectedVersion: 0, sourceUpdatedAt: 1, products: [] }), /CATALOG_VERSION_CONFLICT/)
  const synced = await syncCatalogToD1(api, { version: 2, expectedVersion: 1, sourceUpdatedAt: 1, products: [{ productId: 'real-rose', name: 'Rose v2', category: 'roses', price: 26000, status: 'PUBLISHED', active: true, orderable: true }] })
  assert.equal(synced.version, 2)
  assert.equal(db.prepare('SELECT name, price_iqd FROM catalog_products WHERE product_id=?').get('real-rose').price_iqd, 26000)
})

test('CATALOG_SYNC_FAILURE blocks orders instead of using stale data', async () => {
  const { db, api } = await fixture()
  const catalogApi = d1(db)
  await assert.rejects(syncCatalogToD1(catalogApi, { version: 2, expectedVersion: 1, sourceUpdatedAt: 2, products: [{ productId: 'real-rose', name: null, category: 'roses', price: 26000, status: 'PUBLISHED', active: true, orderable: true }] }), /CATALOG_SYNC_FAILED/)
  assert.equal(db.prepare('SELECT sync_status FROM catalog_versions WHERE shop_id=?').get('floor-232bc').sync_status, 'FAILED')
  await assert.rejects(api.createOrder({ uid: 'customer-1', input: orderInput('stale-catalog') }), /CATALOG_OUT_OF_SYNC/)
})
