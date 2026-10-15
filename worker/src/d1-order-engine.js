import { calculateOrder, normalizeOrderInput, SHOP_ID } from '../../functions/src/order.js'

export const ORDER_ENGINE_ERRORS = Object.freeze({
  DEMO: 'DEMO_ORDER_REJECTED',
  PRODUCT: 'PRODUCT_UNAVAILABLE',
  STOCK: 'INSUFFICIENT_STOCK',
  DELIVERY: 'INVALID_DELIVERY',
  PAYMENT: 'INVALID_PAYMENT',
  IDEMPOTENCY: 'DUPLICATE_ORDER',
  CATALOG: 'CATALOG_OUT_OF_SYNC',
})

function rows(result) { return result?.results || [] }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0) }
function json(value) { return JSON.stringify(value) }
function id(value) { return String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120) || crypto.randomUUID().replace(/-/g, '') }

function productIsDemo(product) {
  return product?.demoTag === 'ALASAS_DEMO_V1' || product?.displayMode === 'DEMO' || product?.orderable === false || product?.status !== 'PUBLISHED' || product?.active === false
}

function inList(values) { return values.map(() => '?').join(',') }

export function d1SnapshotFromRows(products, inventory, delivery, paymentMethods, discounts, settings) {
  const inventoryByProduct = Object.fromEntries(inventory.map(item => [item.product_id, item]))
  return {
    products: Object.fromEntries(products.map(product => [product.product_id, {
      name: product.name, category: product.category, image: product.image, price: product.price_iqd, status: product.status,
      active: Boolean(product.active), orderable: Boolean(product.orderable), demoTag: product.demo_tag, displayMode: product.display_mode,
      stock: inventoryByProduct[product.product_id]?.available_quantity,
    }])),
    delivery, paymentMethods, discounts, settings,
  }
}

export async function syncCatalogToD1(db, { shopId = SHOP_ID, version, sourceUpdatedAt, products, now = Date.now(), expectedVersion = null }) {
  if (!Number.isInteger(version) || version < 1) throw new Error('CATALOG_VERSION_INVALID')
  const current = await db.prepare('SELECT version FROM catalog_versions WHERE shop_id = ?').bind(shopId).first()
  if (expectedVersion !== null && Number(current?.version || 0) !== expectedVersion) throw new Error('CATALOG_VERSION_CONFLICT')
  if (current && Number(current.version) >= version) return { reused: true, version: current.version }
  const statements = [
    db.prepare('INSERT INTO catalog_versions(shop_id, version, source_updated_at, sync_status, last_error, updated_at) VALUES (?, ?, ?, \'SYNCED\', NULL, ?) ON CONFLICT(shop_id) DO UPDATE SET version=excluded.version, source_updated_at=excluded.source_updated_at, sync_status=\'SYNCED\', last_error=NULL, updated_at=excluded.updated_at').bind(shopId, version, sourceUpdatedAt, now),
  ]
  for (const product of products) {
    statements.push(db.prepare('INSERT INTO catalog_products(product_id, shop_id, name, category, image, price_iqd, status, active, orderable, demo_tag, display_mode, catalog_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET name=excluded.name, category=excluded.category, image=excluded.image, price_iqd=excluded.price_iqd, status=excluded.status, active=excluded.active, orderable=excluded.orderable, demo_tag=excluded.demo_tag, display_mode=excluded.display_mode, catalog_version=excluded.catalog_version, updated_at=excluded.updated_at').bind(product.productId, shopId, product.name, product.category, product.image || '', product.price, product.status, product.active === false ? 0 : 1, product.orderable === false ? 0 : 1, product.demoTag || null, product.displayMode || null, version, now))
  }
  try {
    await db.batch(statements)
    return { reused: false, version }
  } catch (error) {
    await db.prepare('INSERT INTO catalog_versions(shop_id, version, source_updated_at, sync_status, last_error, updated_at) VALUES (?, ?, ?, \'FAILED\', ?, ?) ON CONFLICT(shop_id) DO UPDATE SET sync_status=\'FAILED\', last_error=excluded.last_error, updated_at=excluded.updated_at').bind(shopId, version, sourceUpdatedAt, 'CATALOG_SYNC_FAILED', now).run()
    throw new Error('CATALOG_SYNC_FAILED')
  }
}

export async function seedInventoryToD1(db, { shopId = SHOP_ID, inventory, now = Date.now(), catalogVersion = 1 }) {
  const statements = inventory.map(item => db.prepare('INSERT OR IGNORE INTO inventory(product_id, shop_id, available_quantity, reserved_quantity, catalog_version, updated_at) VALUES (?, ?, ?, 0, ?, ?)').bind(item.productId, shopId, item.availableQuantity, catalogVersion, now))
  if (statements.length) await db.batch(statements)
  return { inserted: statements.length }
}

export function createD1OrderRepository(db, { shopId = SHOP_ID, now = () => Date.now(), createId = () => crypto.randomUUID() } = {}) {
  async function readCatalog(productIds) {
    const version = await db.prepare('SELECT version, sync_status FROM catalog_versions WHERE shop_id = ?').bind(shopId).first()
    if (!version || version.sync_status !== 'SYNCED') throw new Error(ORDER_ENGINE_ERRORS.CATALOG)
    const placeholders = inList(productIds)
    const products = rows(await db.prepare(`SELECT * FROM catalog_products WHERE shop_id = ? AND product_id IN (${placeholders})`).bind(shopId, ...productIds).all())
    const inventory = rows(await db.prepare(`SELECT * FROM inventory WHERE shop_id = ? AND product_id IN (${placeholders})`).bind(shopId, ...productIds).all())
    const delivery = rows(await db.prepare('SELECT province, district, price_iqd, enabled FROM delivery_areas WHERE shop_id = ?').bind(shopId).all())
    const paymentMethods = rows(await db.prepare('SELECT method_id, name, type, enabled FROM payment_methods WHERE shop_id = ?').bind(shopId).all())
    const discounts = rows(await db.prepare('SELECT * FROM discounts WHERE shop_id = ?').bind(shopId).all())
    const settings = await db.prepare('SELECT accepting_orders, temporary_closed FROM store_settings WHERE shop_id = ?').bind(shopId).first()
    const deliveryMap = {}
    for (const area of delivery) deliveryMap[area.province] = { areas: { [area.district]: { price: area.price_iqd, enabled: Boolean(area.enabled) } } }
    return { version: version.version, snapshot: d1SnapshotFromRows(products, inventory, deliveryMap, Object.fromEntries(paymentMethods.map(item => [item.method_id, { name: item.name, type: item.type, enabled: Boolean(item.enabled) }])), Object.fromEntries(discounts.map(item => [item.discount_id, item])), { acceptingOrders: Boolean(settings?.accepting_orders), temporaryClosed: Boolean(settings?.temporary_closed) }) }
  }

  async function createOrder({ uid, input }) {
    const normalized = normalizeOrderInput(input)
    const existing = await db.prepare('SELECT status, order_id, total_iqd FROM idempotency_keys WHERE shop_id=? AND uid=? AND idempotency_key=?').bind(shopId, uid, normalized.idempotencyKey).first()
    if (existing?.status === 'COMPLETE') return { orderId: existing.order_id, reused: true, total: existing.total_iqd }
    if (existing?.status === 'PENDING') throw new Error(ORDER_ENGINE_ERRORS.IDEMPOTENCY)
    const catalog = await readCatalog(normalized.items.map(item => item.productId))
    for (const item of normalized.items) {
      const product = catalog.snapshot.products[item.productId]
      if (productIsDemo(product)) throw new Error(product?.demoTag === 'ALASAS_DEMO_V1' || product?.displayMode === 'DEMO' || product?.orderable === false ? ORDER_ENGINE_ERRORS.DEMO : ORDER_ENGINE_ERRORS.PRODUCT)
    }
    let order
    try {
      order = calculateOrder(normalized, catalog.snapshot.products, catalog.snapshot.delivery, catalog.snapshot.paymentMethods, catalog.snapshot.discounts, catalog.snapshot.settings)
    } catch (error) {
      const code = error?.message === 'DELIVERY_AREA_UNCONFIGURED' ? ORDER_ENGINE_ERRORS.DELIVERY : error?.message === 'PAYMENT_METHOD_UNAVAILABLE' ? ORDER_ENGINE_ERRORS.PAYMENT : error?.message
      throw new Error(code || 'ORDER_VALIDATION_FAILED')
    }
    const orderId = createId()
    const guardId = createId()
    const timestamp = now()
    const quantities = Object.fromEntries(order.items.map(item => [item.productId, item.quantity]))
    const productIds = Object.keys(quantities)
    const cases = productIds.map(productId => `WHEN product_id = ? THEN available_quantity - ?`).join(' ')
    const caseParams = productIds.flatMap(productId => [productId, quantities[productId]])
    const required = productIds.length
    const statements = [
      db.prepare('INSERT OR IGNORE INTO idempotency_keys(shop_id, uid, idempotency_key, status, created_at) VALUES (?, ?, ?, \'PENDING\', ?)').bind(shopId, uid, normalized.idempotencyKey, timestamp),
      db.prepare(`UPDATE inventory SET available_quantity = CASE ${cases} ELSE available_quantity END, updated_at = ? WHERE shop_id = ? AND product_id IN (${inList(productIds)}) AND available_quantity >= CASE ${productIds.map(() => 'WHEN product_id = ? THEN ?').join(' ')} ELSE 0 END AND EXISTS (SELECT 1 FROM idempotency_keys WHERE shop_id = ? AND uid = ? AND idempotency_key = ? AND status = 'PENDING')`).bind(...caseParams, timestamp, shopId, ...productIds, ...caseParams, shopId, uid, normalized.idempotencyKey),
      db.prepare('INSERT INTO transaction_guards(guard_id, ok) VALUES (?, CASE WHEN changes() = ? THEN 1 ELSE 0 END)').bind(guardId, required),
      db.prepare('INSERT INTO orders(order_id, shop_id, uid, idempotency_key, status, payment_status, subtotal_iqd, discount_iqd, delivery_fee_iqd, total_iqd, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, \'NEW\', ?, ?, ?, ?, ?, ?, ?, ?)').bind(orderId, shopId, uid, normalized.idempotencyKey, order.paymentMethod.type === 'CASH' ? 'UNPAID' : 'PENDING_REVIEW', order.subtotal, order.discount, order.deliveryFee, order.total, json(order), timestamp, timestamp),
      ...order.items.map((item, lineNo) => db.prepare('INSERT INTO order_items(order_id, line_no, product_id, name, quantity, unit_price_iqd, line_total_iqd) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(orderId, lineNo, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal)),
      ...order.items.flatMap(item => [db.prepare('INSERT INTO inventory_movements(movement_id, product_id, order_id, quantity_delta, movement_type, created_at) VALUES (?, ?, ?, ?, \'ORDER_RESERVED\', ?)').bind(createId(), item.productId, orderId, -item.quantity, timestamp)]),
      db.prepare('UPDATE idempotency_keys SET status=\'COMPLETE\', order_id=?, total_iqd=?, completed_at=? WHERE shop_id=? AND uid=? AND idempotency_key=? AND status=\'PENDING\'').bind(orderId, order.total, timestamp, shopId, uid, normalized.idempotencyKey),
      db.prepare('INSERT INTO order_events(event_id, order_id, actor_uid, event_type, payload_json, created_at) VALUES (?, ?, ?, \'ORDER_CREATED\', ?, ?)').bind(createId(), orderId, uid, json({ catalogVersion: catalog.version }), timestamp),
      db.prepare('DELETE FROM transaction_guards WHERE guard_id = ?').bind(guardId),
    ]
    try {
      await db.batch(statements)
      return { orderId, reused: false, total: order.total }
    } catch (error) {
      const existing = await db.prepare('SELECT status, order_id, total_iqd FROM idempotency_keys WHERE shop_id=? AND uid=? AND idempotency_key=?').bind(shopId, uid, normalized.idempotencyKey).first()
      if (existing?.status === 'COMPLETE') return { orderId: existing.order_id, reused: true, total: existing.total_iqd }
      if (existing?.status === 'PENDING') throw new Error(ORDER_ENGINE_ERRORS.IDEMPOTENCY)
      if (String(error?.message || '').includes('UNIQUE')) throw new Error(ORDER_ENGINE_ERRORS.IDEMPOTENCY)
      throw new Error(String(error?.message || 'TRANSACTION_ROLLBACK'))
    }
  }

  return { createOrder, readCatalog }
}
