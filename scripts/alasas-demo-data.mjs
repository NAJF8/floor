export const SHOP_ID = 'floor-232bc'
export const DEMO_TAG = 'ALASAS_DEMO_V1'

const images = [
  'photo-1490750967868-88aa4486c946', 'photo-1523438885200-e635ba2c371e', 'photo-1519225421980-715cb0215aed',
  'photo-1526047932273-341f2a7631f9', 'photo-1508610048659-a06b669e3321', 'photo-1527061011665-3652c757a4d4',
  'photo-1548094971-2e4a2a1f13a4', 'photo-1561181286-d3fee7d55364', 'photo-1606800052052-a08af7148866',
  'photo-1513159446162-54eb8bdaa79b', 'photo-1522673607200-164d1b6ce486', 'photo-1518709268805-4e9042af9f23',
  'photo-1495231916356-a86217efff12', 'photo-1509423350716-97f9360b4e09', 'photo-1497250681960-ef046c08a56e',
  'photo-1501004318641-b39e6451bec6', 'photo-1455587734955-081b22074882', 'photo-1469259943454-aa100abba749',
].map(id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`)

export const demoCategories = {
  demoRoses: { name: 'باقات الورد', nameEn: 'Rose Bouquets', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[0], order: 1, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
  demoBoxes: { name: 'بوكسات الورد', nameEn: 'Flower Boxes', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[1], order: 2, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
  demoOccasions: { name: 'هدايا المناسبات', nameEn: 'Occasion Gifts', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[2], order: 3, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
  demoChocolate: { name: 'ورد مع شوكولاتة', nameEn: 'Flowers and Chocolate', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[3], order: 4, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
  demoGraduation: { name: 'ورد التخرج', nameEn: 'Graduation Flowers', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[4], order: 5, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
  demoLuxury: { name: 'تنسيقات فاخرة', nameEn: 'Luxury Arrangements', description: 'بيانات تجريبية معزولة للـEmulator.', image: images[5], order: 6, visible: true, status: 'PUBLISHED', demoTag: DEMO_TAG },
}

const productNames = [
  ['باقة ورد أحمر', 'Red Rose Bouquet', 'demoRoses', 35000], ['باقة ورد وردي', 'Pink Rose Bouquet', 'demoRoses', 42000], ['باقة الربيع', 'Spring Bouquet', 'demoRoses', 48000],
  ['بوكس ورد ناعم', 'Soft Flower Box', 'demoBoxes', 55000], ['بوكس أبيض أنيق', 'Elegant White Box', 'demoBoxes', 65000], ['بوكس ورد صغير', 'Mini Flower Box', 'demoBoxes', 30000],
  ['هدية عيد ميلاد', 'Birthday Gift', 'demoOccasions', 45000], ['هدية ذكرى جميلة', 'Anniversary Gift', 'demoOccasions', 60000], ['هدية امتنان', 'Thank You Gift', 'demoOccasions', 38000],
  ['ورد وشوكولاتة', 'Flowers and Chocolate', 'demoChocolate', 52000], ['بوكس شوكولاتة فاخر', 'Luxury Chocolate Box', 'demoChocolate', 72000], ['ورد مع حلوى', 'Flowers and Sweets', 'demoChocolate', 47000],
  ['باقة تخرج وردية', 'Pink Graduation Bouquet', 'demoGraduation', 40000], ['باقة تخرج فاخرة', 'Luxury Graduation Bouquet', 'demoGraduation', 68000], ['قبعة تخرج مع ورد', 'Graduation Hat and Flowers', 'demoGraduation', 55000],
  ['التنسيق الملكي', 'Royal Arrangement', 'demoLuxury', 95000], ['تنسيق أبيض فاخر', 'Luxury White Arrangement', 'demoLuxury', 88000], ['بوكيه التوليب الفاخر', 'Luxury Tulip Bouquet', 'demoLuxury', 76000],
]

export const demoProducts = Object.fromEntries(productNames.map(([name, nameEn, category, price], index) => [`demoProduct${String(index + 1).padStart(2, '0')}`, { name, nameEn, category, description: 'سجل DEMO معزول للاختبار المحلي فقط.', price, costPrice: Math.floor(price * .55), stock: 12 + index, reorderLevel: 3, status: 'PUBLISHED', active: true, image: images[index % images.length], imageUrls: [images[index % images.length]], demoTag: DEMO_TAG }]))

export const demoInventory = {
  demoRibbon: { name: 'شريط تغليف DEMO', quantity: 40, unit: 'قطعة', reorderLevel: 5, active: true, status: 'ACTIVE', demoTag: DEMO_TAG },
  demoPaper: { name: 'ورق تغليف DEMO', quantity: 30, unit: 'ورقة', reorderLevel: 5, active: true, status: 'ACTIVE', demoTag: DEMO_TAG },
}
