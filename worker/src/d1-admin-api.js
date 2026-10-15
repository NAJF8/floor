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
    async updateStatus({ claims, orderId, nextStatus } = {}) {
      const uid = requireRole(claims, 'EMPLOYEE')
      if (!allowedStatuses.has(nextStatus) || ['PAYMENT_CONFIRMED', 'APPROVED', 'CANCELLED'].includes(nextStatus)) throw new Error('INVALID_ORDER_STATUS')
      const current = await db.prepare('SELECT status FROM orders WHERE shop_id=? AND order_id=?').bind(shopId, orderId).first()
      if (!current) throw new Error('ORDER_NOT_FOUND')
      if (!canTransitionOrderStatus(current.status, nextStatus)) throw new Error('INVALID_ORDER_TRANSITION')
      await db.batch([
        db.prepare('UPDATE orders SET status=?, updated_at=? WHERE shop_id=? AND order_id=? AND status=?').bind(nextStatus, Date.now(), shopId, orderId, current.status),
        db.prepare('INSERT INTO order_events(event_id, order_id, actor_uid, event_type, payload_json, created_at) VALUES (?, ?, ?, \'ORDER_STATUS_CHANGED\', ?, ?)').bind(crypto.randomUUID(), orderId, uid, JSON.stringify({ nextStatus }), Date.now()),
      ])
      return { orderId, status: nextStatus }
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
        db.prepare('INSERT INTO order_events(event_id, order_id, actor_uid, event_type, payload_json, created_at) VALUES (?, ?, ?, \'ORDER_CANCELLED\', ?, ?)').bind(crypto.randomUUID(), orderId, uid, JSON.stringify({ stockRestored: true }), now),
      ])
      return { orderId, reused: false, status: 'CANCELLED', stockRestored: true }
    },
  }
}
