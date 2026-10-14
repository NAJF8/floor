import { getAuth } from 'firebase-admin/auth'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || ''
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(authHost)) throw new Error('Refusing to seed: Auth and Database must point to local emulators.')

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `customer-browser-seed-${Date.now()}`)
const auth = getAuth(app)
const database = getDatabase(app)
const email = process.env.LOCAL_CUSTOMER_EMAIL || 'customer-browser@example.test'
const password = process.env.LOCAL_CUSTOMER_PASSWORD || 'LocalOnly-123456'
try {
  let user
  try { user = await auth.getUserByEmail(email) } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error
    user = await auth.createUser({ email, password, emailVerified: true, displayName: 'Synthetic Customer Browser' })
  }
  await auth.updateUser(user.uid, { emailVerified: true, password, displayName: 'Synthetic Customer Browser' })
  await database.ref(`shops/${SHOP_ID}`).set({
    products: {
      browserRose: { name: 'Synthetic browser rose', nameEn: 'Synthetic Browser Rose', price: 15000, category: 'roses', status: 'PUBLISHED', active: true, imageUrls: ['https://images.unsplash.com/photo-1548094971-2e4a2a1f13a4?auto=format&fit=crop&w=900&h=1100&q=88', 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=900&h=1100&q=88'], addOns: ['Ribbon'], inventoryRecipe: { ribbon: 1 }, stock: 4 },
      browserGift: { name: 'Synthetic browser gift box', nameEn: 'Synthetic Browser Gift Box', price: 12000, category: 'roses', status: 'PUBLISHED', active: true, imageUrls: ['https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=900&h=1100&q=88'], stock: 5 },
      browserDraft: { name: 'Synthetic draft hidden', price: 1, category: 'roses', status: 'DRAFT', active: false },
    },
    public: {
      categories: { roses: { name: 'باقات اصطناعية', description: 'بيانات اختبار محلية', order: 1, visible: true, status: 'PUBLISHED' } },
      delivery: { Najaf: { enabled: true, areas: { University: { price: 4000, enabled: true }, ClosedArea: { price: 7000, enabled: false } } } },
      paymentMethods: { cash: { name: 'نقدي اصطناعي', type: 'CASH', enabled: true, order: 1 }, zain: { name: 'زين كاش اصطناعي', type: 'ZAINCASH', enabled: true, walletName: 'Synthetic wallet', walletNumber: '07700000002', order: 2 } },
      settings: { storeName: 'AL ASAS Synthetic', whatsapp: '9647700000000', acceptingOrders: true },
      homepage: { heroTitle: 'بيانات Emulator فقط', heroDescription: 'لا توجد كتابة Production في هذا الاختبار.' },
      aiAssistant: { enabled: false },
    },
    private: { inventory: { ribbon: { name: 'Synthetic ribbon', quantity: 3, unit: 'piece', reorderLevel: 1, active: true, status: 'ACTIVE' } } },
  })
  console.log(JSON.stringify({ seeded: true, project: SHOP_ID, namespace, uid: user.uid, email, password, publishedProducts: ['browserRose', 'browserGift'], disabledArea: 'ClosedArea' }, null, 2))
} finally {
  await deleteApp(app)
}
