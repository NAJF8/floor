import { canTransitionOrderStatus, SHOP_ID } from '../../functions/src/order.js'

const roles = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 }
const allowedStatuses = new Set(['NEW', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'PAYMENT_CONFIRMED', 'APPROVED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'])

function requireRole(claims, minimum = 'VIEWER', permission = 'orders') {
  const role = claims?.role
  if (typeof claims?.uid !== 'string' || (roles[role] ?? -1) < roles[minimum]) throw new Error('ADMIN_PERMISSION_DENIED')
  if (role !== 'SUPER_ADMIN' && claims.permissions?.[permission] === false) throw new Error('ADMIN_PERMISSION_DENIED')
  return claims.uid
}

function resultRows(result) { return result?.results || [] }
function event(db, orderId, actorUid, eventType, payload = {}) {
  return db.prepare('INSERT INTO order_events(event_id, order_id, actor_uid, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), orderId, actorUid, eventType, JSON.stringify(payload), Date.now())
}

export function createD1AdminApi(db, { shopId = SHOP_ID } = {}) {
  return {
    async listOrders({ claims, status, query = '', limit = 50 } = {}) {
      requireRole(claims, 'VIEWER')
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
      const params = [shopId]
      let sql = 'SELECT order_id, uid, status, payment_status, total_iqd, created_at, updated_at FROM orders WHERE shop_id=?'
      if (status) { sql += ' AND status=?'; params.push(status) }
      if (query) { sql += ' AND (order_id LIKE ? OR uid LIKE ?)'; params.push(`%${query}%`, `%${query}%`) }
      sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(safeLimit)
      return resultRows(await db.prepare(sql).bind(...params).all())
    },
    async getOrder({ claims, orderId } = {}) {
      requireRole(claims, 'VIEWER')
      const order = await db.prepare('SELECT * FROM orders WHERE shop_id=? AND order_id=?').bind(shopId, orderId).first()
      if (!order) throw new Error('ORDER_NOT_FOUND')
      const items = resultRows(await db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY line_no').bind(orderId).all())
      const events = resultRows(await db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC').bind(orderId).all())
      return { order, items, events }
    },
    async getCustomerOrder({ uid, orderId } = {}) {
      if (typeof uid !== 'string' || !uid || typeof orderId !== 'string' || !orderId) throw new Error('ORDER_NOT_FOUND')
      const order = await db.prepare('SELECT order_id, uid, status, payment_status, total_iqd, payload_json, created_at, updated_at FROM orders WHERE shop_id=? AND order_id=? AND uid=?').bind(shopId, orderId, uid).first()
      if (!order) throw new Error('ORDER_NOT_FOUND')
      let payload = {}
      try { payload = JSON.parse(order.payload_json || '{}') } catch { payload = {} }
      return {
        orderId: order.order_id,
        orderStatus: order.status,
        paymentStatus: order.payment_status,
        total: Number(order.total_iqd) || 0,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        deliveryAt: typeof payload.deliveryAt === 'string' ? payload.deliveryAt : '',
        items: resultRows(await db.prepare('SELECT name, quantity, line_total_iqd AS lineTotal FROM order_items WHERE order_id=? ORDER BY line_no').bind(orderId).all()),
      }
    },
    async updateStatus({ claims, orderId, nextStatus } = {}) {
      const minimum = ['PAYMENT_CONFIRMED', 'APPROVED'].includes(nextStatus) ? 'MANAGER' : 'EMPLOYEE'
      const uid = requireRole(claims, minimum)
      if (!allowedStatuses.has(nextStatus) || nextStatus === 'CANCELLED') throw new Error('INVALID_ORDER_STATUS')
      const current = await db.prepare('SELECT status FROM orders WHERE shop_id=? AND order_id=?').bind(shopId, orderId).first()
      if (!current) throw new Error('ORDER_NOT_FOUND')
      if (!canTransitionOrderStatus(current.status, nextStatus)) throw new Error('INVALID_ORDER_TRANSITION')
      const now = Date.now()
      await db.batch([
        db.prepare('UPDATE orders SET status=?, payment_status=CASE WHEN ?=\'PAYMENT_CONFIRMED\' THEN \'CONFIRMED\' ELSE payment_status END, updated_at=? WHERE shop_id=? AND order_id=? AND status=?').bind(nextStatus, nextStatus, now, shopId, orderId, current.status),
        event(db, orderId, uid, 'ORDER_STATUS_CHANGED', { previousStatus: current.status, nextStatus }),
      ])
      return { orderId, status: nextStatus }
    },
    async scheduleDelivery({ claims, orderId, deliveryAt } = {}) {
      const uid = requireRole(claims, 'MANAGER')
      if (typeof deliveryAt !== 'string' || deliveryAt.trim().length === 0 || deliveryAt.length > 80) throw new Error('INVALID_DELIVERY_AT')
      const current = await db.prepare('SELECT payload_json FROM orders WHERE shop_id=? AND order_id=?').bind(shopId, orderId).first()
      if (!current) throw new Error('ORDER_NOT_FOUND')
      let payload
      try { payload = JSON.parse(current.payload_json || '{}') } catch { throw new Error('ORDER_PAYLOAD_INVALID') }
      payload.deliveryAt = deliveryAt.trim()
      const now = Date.now()
      await db.batch([
        db.prepare('UPDATE orders SET payload_json=?, updated_at=? WHERE shop_id=? AND order_id=?').bind(JSON.stringify(payload), now, shopId, orderId),
        event(db, orderId, uid, 'DELIVERY_SCHEDULED', { deliveryAt: payload.deliveryAt }),
      ])
      return { orderId, deliveryAt: payload.deliveryAt }
    },
    async cancelOrder({ claims, orderId } = {}) {
      const uid = requireRole(claims, 'MANAGER')
      const current = await db.prepare('SELECT status FROM orders WHERE shop_id=? AND order_id=?').bind(shopId, orderId).first()
      if (!current) throw new Error('ORDER_NOT_FOUND')
      if (current.status === 'CANCELLED') return { orderId, reused: true }
      if (['DELIVERED', 'REJECTED'].includes(current.status)) throw new Error('ORDER_NOT_CANCELLABLE')
      const now = Date.now()
      await db.batch([
        db.prepare("UPDATE orders SET status='CANCELLED', updated_at=? WHERE shop_id=? AND order_id=? AND status NOT IN ('CANCELLED','DELIVERED','REJECTED')").bind(now, shopId, orderId),
        db.prepare("UPDATE inventory SET available_quantity = available_quantity + (SELECT COALESCE(SUM(-quantity_delta), 0) FROM inventory_movements WHERE order_id=? AND movement_type='ORDER_RESERVED') WHERE shop_id=? AND product_id IN (SELECT product_id FROM order_items WHERE order_id=?) AND NOT EXISTS (SELECT 1 FROM inventory_movements WHERE order_id=? AND movement_type='ORDER_RELEASED')").bind(orderId, shopId, orderId, orderId),
        db.prepare("INSERT INTO inventory_movements(movement_id, product_id, order_id, quantity_delta, movement_type, created_at) SELECT lower(hex(randomblob(16))), product_id, ?, quantity, 'ORDER_RELEASED', ? FROM order_items WHERE order_id=? AND NOT EXISTS (SELECT 1 FROM inventory_movements WHERE order_id=? AND movement_type='ORDER_RELEASED')").bind(orderId, now, orderId, orderId),
        event(db, orderId, uid, 'ORDER_CANCELLED', { stockRestored: true }),
      ])
      return { orderId, reused: false, status: 'CANCELLED', stockRestored: true }
    },
  }
}
