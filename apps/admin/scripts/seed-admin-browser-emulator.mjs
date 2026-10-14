import { getAuth } from 'firebase-admin/auth'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || ''
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(databaseHost) || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(authHost)) {
  throw new Error('Refusing to seed: both Firebase Auth and Database must point to local emulators.')
}

const email = process.env.LOCAL_ADMIN_EMAIL || 'admin-browser@example.test'
const password = process.env.LOCAL_ADMIN_PASSWORD
if (!password) throw new Error('Refusing to seed: set LOCAL_ADMIN_PASSWORD for the local emulator only.')
const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${databaseHost}?ns=${namespace}` }, `admin-browser-seed-${Date.now()}`)
const auth = getAuth(app)
const database = getDatabase(app)

try {
  let user
  try { user = await auth.getUserByEmail(email) } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error
    user = await auth.createUser({ email, password, emailVerified: true, displayName: 'Synthetic Admin Browser' })
  }
  await auth.updateUser(user.uid, { emailVerified: true, password, displayName: 'Synthetic Admin Browser' })
  const root = database.ref(`shops/${SHOP_ID}`)
  await root.set({
    products: { browserProduct: { name: 'Synthetic admin bouquet', nameEn: 'Synthetic admin bouquet', category: 'browserCategory', price: 22000, compareAtPrice: 26000, discountPercent: 15, status: 'PUBLISHED', active: true, stock: 7, reorderLevel: 2, imageUrls: ['https://example.test/admin-1.jpg', 'https://example.test/admin-2.jpg'] } },
    public: {
      categories: { browserCategory: { name: 'قسم اختبار الإدارة', nameEn: 'Admin browser category', visible: true, status: 'PUBLISHED', featured: true, order: 1 } },
      delivery: { Najaf: { enabled: true, areas: { University: { enabled: true, price: 4000, deliveryAt: '12:00-20:00' } } } },
      paymentMethods: { cash: { name: 'نقدي اصطناعي', type: 'CASH', enabled: true, order: 1 } },
      settings: { storeName: 'AL ASAS Admin Emulator', whatsapp: '07700000000', acceptingOrders: true },
      homepage: { heroTitle: 'Admin Emulator Home', heroDescription: 'Synthetic local admin reflection' },
      aiAssistant: { enabled: false },
      discounts: { browserOffer: { name: 'عرض اصطناعي', code: '', scope: 'ALL', discountType: 'PERCENT', value: 10, active: true } },
    },
    private: {
      orders: { browserOrder: { id: 'browserOrder', uid: 'synthetic-customer', customerName: 'Synthetic Customer', phone: '07700000001', total: 26000, subtotal: 22000, deliveryFee: 4000, discount: 0, paymentMethod: { id: 'cash', type: 'CASH', name: 'نقدي اصطناعي' }, paymentStatus: 'UNPAID', orderStatus: 'NEW', province: 'Najaf', createdAt: Date.now(), updatedAt: Date.now(), items: [{ productId: 'browserProduct', name: 'Synthetic admin bouquet', quantity: 1, lineTotal: 22000 }] } },
      inventory: { ribbon: { name: 'Synthetic ribbon', quantity: 9, unit: 'piece', reorderLevel: 2, status: 'ACTIVE' } },
      activityLogs: { browserLog: { action: 'ADMIN_WRITE', actorUid: user.uid, target: 'browserProduct', createdAt: Date.now() } },
      staff: { [user.uid]: { uid: user.uid, email, displayName: 'Synthetic Admin Browser', role: 'ADMIN', active: true } },
    },
  })
  await database.ref(`shopMemberships/${user.uid}/${SHOP_ID}`).set({ role: 'ADMIN', active: true, email, permissions: { orders: true, products: true, inventory: true, catalog: true, staff: true, audit: true, settings: true } })
  console.log(JSON.stringify({ seeded: true, project: SHOP_ID, namespace, uid: user.uid, email }, null, 2))
} finally {
  await deleteApp(app)
}
