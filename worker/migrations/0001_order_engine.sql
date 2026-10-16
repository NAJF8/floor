PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_versions (
  shop_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  source_updated_at INTEGER NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('SYNCED', 'STALE', 'FAILED')),
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_products (
  product_id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  price_iqd INTEGER NOT NULL CHECK (price_iqd >= 0),
  status TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  orderable INTEGER NOT NULL CHECK (orderable IN (0, 1)),
  demo_tag TEXT,
  display_mode TEXT,
  catalog_version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (shop_id) REFERENCES catalog_versions(shop_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  catalog_version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES catalog_products(product_id)
);

CREATE TABLE IF NOT EXISTS delivery_areas (
  shop_id TEXT NOT NULL,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  price_iqd INTEGER NOT NULL CHECK (price_iqd >= 0),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  PRIMARY KEY (shop_id, province, district)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  shop_id TEXT NOT NULL,
  method_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  PRIMARY KEY (shop_id, method_id)
);

CREATE TABLE IF NOT EXISTS discounts (
  shop_id TEXT NOT NULL,
  discount_id TEXT NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  max_uses INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  PRIMARY KEY (shop_id, discount_id)
);

CREATE TABLE IF NOT EXISTS store_settings (
  shop_id TEXT PRIMARY KEY,
  accepting_orders INTEGER NOT NULL CHECK (accepting_orders IN (0, 1)),
  temporary_closed INTEGER NOT NULL CHECK (temporary_closed IN (0, 1))
);

CREATE TABLE IF NOT EXISTS gifting_options (
  shop_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  option_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  price_iqd INTEGER NOT NULL CHECK (price_iqd >= 0),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  stock INTEGER,
  bouquet_compatible INTEGER NOT NULL DEFAULT 1 CHECK (bouquet_compatible IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (shop_id, group_name, option_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'PAYMENT_CONFIRMED', 'CANCELLED', 'REJECTED', 'APPROVED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PENDING_REVIEW', 'CONFIRMED')),
  subtotal_iqd INTEGER NOT NULL CHECK (subtotal_iqd >= 0),
  discount_iqd INTEGER NOT NULL CHECK (discount_iqd >= 0),
  delivery_fee_iqd INTEGER NOT NULL CHECK (delivery_fee_iqd >= 0),
  total_iqd INTEGER NOT NULL CHECK (total_iqd >= 0),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (shop_id, uid, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no >= 0),
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_iqd INTEGER NOT NULL CHECK (unit_price_iqd >= 0),
  line_total_iqd INTEGER NOT NULL CHECK (line_total_iqd >= 0),
  PRIMARY KEY (order_id, line_no),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  movement_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('ORDER_RESERVED', 'ORDER_RELEASED')),
  created_at INTEGER NOT NULL,
  UNIQUE (product_id, order_id, movement_type),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  shop_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETE')),
  order_id TEXT,
  total_iqd INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (shop_id, uid, idempotency_key),
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE TABLE IF NOT EXISTS order_events (
  event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transaction_guards (
  guard_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_uid_created ON orders(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order_created ON order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_shop ON inventory(shop_id);
