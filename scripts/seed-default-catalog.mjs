import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const SHOP_ID = 'floor-232bc'
const commit = process.argv.includes('--commit')
const databaseUrl = 'https://floor-232bc-default-rtdb.europe-west1.firebasedatabase.app'

const categories = {
  roses: { name: 'باقات الورد', nameEn: 'Rose Bouquets', description: 'باقات ورد منسقة للمناسبات المختلفة.', order: 1, visible: false, status: 'DRAFT' },
  natural: { name: 'الورد الطبيعي', nameEn: 'Fresh Flowers', description: 'زهور طبيعية مختارة حسب التوفر.', order: 2, visible: false, status: 'DRAFT' },
  giftBoxes: { name: 'بوكسات الهدايا', nameEn: 'Gift Boxes', description: 'تنسيقات ورد وهدايا في صندوق واحد.', order: 3, visible: false, status: 'DRAFT' },
  graduation: { name: 'هدايا التخرج', nameEn: 'Graduation Gifts', description: 'تنسيقات قابلة للتخصيص لحفلات التخرج.', order: 4, visible: false, status: 'DRAFT' },
  birthdays: { name: 'أعياد الميلاد', nameEn: 'Birthdays', description: 'هدايا أعياد الميلاد.', order: 5, visible: false, status: 'DRAFT' },
  love: { name: 'هدايا الحب', nameEn: 'Love Gifts', description: 'تنسيقات للتعبير عن المشاعر.', order: 6, visible: false, status: 'DRAFT' },
  occasions: { name: 'المناسبات', nameEn: 'Occasions', description: 'هدايا لمناسباتك الخاصة.', order: 7, visible: false, status: 'DRAFT' },
  chocolate: { name: 'الشوكولاتة', nameEn: 'Chocolate', description: 'إضافات شوكولاتة قابلة للتعديل.', order: 8, visible: false, status: 'DRAFT' },
  luxury: { name: 'الهدايا الفاخرة', nameEn: 'Luxury Gifts', description: 'تنسيقات فاخرة حسب الطلب.', order: 9, visible: false, status: 'DRAFT' },
  custom: { name: 'صمّم باقتك', nameEn: 'Design Your Bouquet', description: 'تنسيق مخصص يحتاج اعتماد المتجر.', order: 10, visible: false, status: 'DRAFT' },
}

const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=1100&q=88`
const products = {
  classicRed: { name: 'باقة الورد الأحمر', nameEn: 'Classic Red Roses', category: 'roses', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1548094971-2e4a2a1f13a4')], featured: false },
  softTulip: { name: 'بوكيه التوليب الناعم', nameEn: 'Soft Tulip Bouquet', category: 'natural', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1523438885200-e635ba2c371e')], featured: false },
  whiteCloud: { name: 'باقة الغيمة البيضاء', nameEn: 'White Cloud Bouquet', category: 'natural', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1561181286-d3fee7d55364')], featured: false },
  pinkGraduation: { name: 'باقة التخرج الوردية', nameEn: 'Pink Graduation', category: 'graduation', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1526047932273-341f2a7631f9')], featured: false },
  flowerChocolate: { name: 'بوكس ورد وشوكولاتة', nameEn: 'Flowers and Chocolate Box', category: 'giftBoxes', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1606800052052-a08af7148866')], featured: false },
  mixedBouquet: { name: 'ورد مشكل بتفاصيل خضراء', nameEn: 'Green Mixed Bouquet', category: 'roses', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1522673607200-164d1b6ce486')], featured: false },
  sunflower: { name: 'باقة دوار الشمس', nameEn: 'Sunflower Energy', category: 'occasions', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1508610048659-a06b669e3321')], featured: false },
  luxurySignature: { name: 'باقة الورد الفاخر', nameEn: 'Luxury Signature', category: 'luxury', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1527061011665-3652c757a4d4')], featured: false },
  apology: { name: 'بوكيه اعتذار', nameEn: 'Apology Bouquet', category: 'love', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1519225421980-715cb0215aed')], featured: false },
  birthday: { name: 'هدية عيد ميلاد', nameEn: 'Birthday Gift', category: 'birthdays', description: 'منتج افتراضي يحتاج مراجعة التوفر والسعر قبل النشر.', price: 0, costPrice: 0, stock: 0, status: 'DRAFT', active: false, imageUrls: [image('photo-1513159446162-54eb8bdaa79b')], featured: false },
}

function credential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) return cert(JSON.parse(raw))
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('No Admin credential configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS; no read or write was attempted.')
  return undefined
}

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: SHOP_ID, databaseURL: databaseUrl, ...(credential() ? { credential: credential() } : {}) })
const database = getDatabase(app)
const root = database.ref(`shops/${SHOP_ID}`)
const [categorySnapshot, productSnapshot] = await Promise.all([root.child('public/categories').get(), root.child('products').get()])
const existingCategories = categorySnapshot.val() || {}
const existingProducts = productSnapshot.val() || {}
const categoryEntries = Object.entries(categories).filter(([id]) => !existingCategories[id])
const productEntries = Object.entries(products).filter(([id]) => !existingProducts[id])

console.log(JSON.stringify({ mode: commit ? 'COMMIT' : 'PREVIEW', project: SHOP_ID, categoryAdds: categoryEntries.map(([id]) => id), productAdds: productEntries.map(([id]) => id), existingCategories: Object.keys(existingCategories).length, existingProducts: Object.keys(existingProducts).length }, null, 2))

if (!commit) {
  console.log('Preview only. No Firebase write was performed. Re-run with --commit only after explicit approval.')
  process.exit(0)
}

const now = Date.now()
const updates = {}
for (const [id, value] of categoryEntries) updates[`shops/${SHOP_ID}/public/categories/${id}`] = { ...value, createdAt: now, updatedAt: now }
for (const [id, value] of productEntries) updates[`shops/${SHOP_ID}/products/${id}`] = { ...value, createdAt: now, updatedAt: now }
if (Object.keys(updates).length) await database.ref().update(updates)
console.log(`Committed ${categoryEntries.length} categories and ${productEntries.length} draft products without deleting existing records.`)
