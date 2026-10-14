import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || ''
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || `${SHOP_ID}-default-rtdb`
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Refusing to seed: FIREBASE_DATABASE_EMULATOR_HOST must point to a local emulator.')

const app = initializeApp({ projectId: SHOP_ID, databaseURL: `http://${host}?ns=${namespace}` }, `customer-browser-seed-${Date.now()}`)
const database = getDatabase(app)
try {
  await database.ref(`shops/${SHOP_ID}`).set({
    products: {
      browserRose: { name: 'Synthetic browser rose', nameEn: 'Synthetic Browser Rose', price: 15000, category: 'roses', status: 'PUBLISHED', active: true, imageUrls: ['https://images.unsplash.com/photo-1548094971-2e4a2a1f13a4?auto=format&fit=crop&w=900&h=1100&q=88', 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=900&h=1100&q=88'], addOns: ['Ribbon'], stock: 4 },
      browserDraft: { name: 'Synthetic draft hidden', price: 1, category: 'roses', status: 'DRAFT', active: false },
    },
    public: {
      categories: { roses: { name: 'باقات اصطناعية', description: 'بيانات اختبار محلية', order: 1, visible: true, status: 'PUBLISHED' } },
      delivery: { Najaf: { enabled: true, areas: { University: { price: 4000, enabled: true }, ClosedArea: { price: 7000, enabled: false } } } },
      paymentMethods: { cash: { name: 'نقدي اصطناعي', type: 'CASH', enabled: true, order: 1 } },
      settings: { storeName: 'AL ASAS Synthetic', whatsapp: '9647700000000', acceptingOrders: true },
      homepage: { heroTitle: 'بيانات Emulator فقط', heroDescription: 'لا توجد كتابة Production في هذا الاختبار.' },
      aiAssistant: { enabled: false },
    },
  })
  console.log(JSON.stringify({ seeded: true, project: SHOP_ID, namespace, publishedProduct: 'browserRose', disabledArea: 'ClosedArea' }, null, 2))
} finally {
  await deleteApp(app)
}
