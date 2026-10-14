import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, 'dist')
const customer = join(root, 'apps', 'customer', 'dist')
const admin = join(root, 'apps', 'admin', 'dist')
const customerRoutes = ['shop', 'design-your-bouquet', 'ai-bouquet-designer', 'cart', 'checkout', 'track-order', 'favorites', 'account']
const adminRoutes = ['admin', 'categories', 'products', 'orders', 'inventory', 'discounts', 'customers', 'delivery', 'payments', 'homepage', 'settings', 'ai', 'staff', 'reports', 'import-export', 'not-found']

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
cpSync(customer, output, { recursive: true })
for (const route of customerRoutes) {
  const routeDir = join(output, route)
  mkdirSync(routeDir, { recursive: true })
  cpSync(join(output, 'index.html'), join(routeDir, 'index.html'))
}
cpSync(join(output, 'index.html'), join(output, '404.html'))
mkdirSync(join(output, 'admin'), { recursive: true })
cpSync(admin, join(output, 'admin'), { recursive: true })

const adminIndex = join(output, 'admin', 'index.html')
for (const route of adminRoutes) {
  const routeDir = join(output, 'admin', route)
  mkdirSync(routeDir, { recursive: true })
  cpSync(adminIndex, join(routeDir, 'index.html'))
}
cpSync(adminIndex, join(output, 'admin', '404.html'))
