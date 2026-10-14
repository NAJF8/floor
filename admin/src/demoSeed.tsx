import { useMemo, useState } from 'react'
import { get, ref, update } from 'firebase/database'
import { useAdminSession } from './adminAuth'
import { getFirebaseDatabase, SHOP_ID } from './firebase'
// The seed source remains the repository's canonical demo-data module.
// @ts-expect-error The shared seed file is a Node ESM data module without a declaration file.
import { DEMO_TAG, demoCategories, demoProducts } from '../../scripts/alasas-demo-data.mjs'

const root = `shops/${SHOP_ID}`

export function DemoSeedPage() {
  const session = useAdminSession()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ categoryAdds: string[]; productAdds: string[]; skippedCategories: string[]; skippedProducts: string[]; verified: boolean } | null>(null)
  const categoryEntries = useMemo(() => Object.entries(demoCategories) as Array<[string, Record<string, unknown>]>, [])
  const productEntries = useMemo(() => Object.entries(demoProducts) as Array<[string, Record<string, unknown>]>, [])
  const authorized = session.membership?.active === true && session.membership.role === 'SUPER_ADMIN'

  const seed = async () => {
    if (!authorized) { setMessage('هذه الأداة متاحة لـSUPER_ADMIN فعال فقط.'); return }
    setBusy(true); setMessage('جارٍ قراءة Production وبناء Preview...'); setResult(null)
    try {
      const database = getFirebaseDatabase()
      const [categoriesSnapshot, productsSnapshot] = await Promise.all([get(ref(database, `${root}/public/categories`)), get(ref(database, `${root}/products`))])
      const existingCategories = categoriesSnapshot.val() && typeof categoriesSnapshot.val() === 'object' ? categoriesSnapshot.val() as Record<string, any> : {}
      const existingProducts = productsSnapshot.val() && typeof productsSnapshot.val() === 'object' ? productsSnapshot.val() as Record<string, any> : {}
      const now = Date.now(); const updates: Record<string, unknown> = {}; const categoryAdds: string[] = []; const productAdds: string[] = []; const skippedCategories: string[] = []; const skippedProducts: string[] = []
      for (const [id, value] of categoryEntries) { if (Object.prototype.hasOwnProperty.call(existingCategories, id)) { skippedCategories.push(id); continue }; updates[`${root}/public/categories/${id}`] = { ...value, createdAt: now, updatedAt: now }; categoryAdds.push(`${root}/public/categories/${id}`) }
      for (const [id, value] of productEntries) { if (Object.prototype.hasOwnProperty.call(existingProducts, id)) { skippedProducts.push(id); continue }; updates[`${root}/products/${id}`] = { ...value, status: 'DRAFT', active: false, createdAt: now, updatedAt: now }; productAdds.push(`${root}/products/${id}`) }
      if (Object.keys(updates).length) await update(ref(database), updates)
      const [verifiedCategories, verifiedProducts] = await Promise.all([get(ref(database, `${root}/public/categories`)), get(ref(database, `${root}/products`))])
      const categoryData = verifiedCategories.val() || {}; const productData = verifiedProducts.val() || {}
      const verified = categoryEntries.every(([id]) => categoryData[id]?.demoTag === DEMO_TAG) && productEntries.every(([id]) => productData[id]?.demoTag === DEMO_TAG && productData[id]?.status === 'DRAFT' && productData[id]?.active === false)
      setResult({ categoryAdds, productAdds, skippedCategories, skippedProducts, verified }); setMessage(verified ? 'تمت الكتابة والقراءة اللاحقة من Production. المنتجات بقيت DRAFT وغير قابلة للطلب.' : 'فشل تحقق القراءة اللاحقة؛ لم يتم إعلان نجاح seed.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر تنفيذ seed عبر جلسة Firebase الحالية.') } finally { setBusy(false) }
  }

  if (!authorized) return <><h1>Demo Seed</h1><section className="panel"><p>الوصول مرفوض: يلزم حساب SUPER_ADMIN فعال.</p></section></>
  return <><header className="page-header"><div><span className="eyebrow">أداة مؤقتة محمية</span><h1>رفع Demo إلى Production</h1><p>المصدر {DEMO_TAG}. لا تستخدم Service Account ولا تغيّر Rules أو Functions.</p></div></header><section className="panel form-panel"><h2>Preview النهائي</h2><p>الأقسام: {categoryEntries.length} · المنتجات: {productEntries.length} · الصور: {new Set(productEntries.map(([, value]) => value.image)).size}</p><p>الحالة: الأقسام PUBLISHED، المنتجات DRAFT + غير نشطة لحماية الطلبات التجارية.</p><button className="primary" disabled={busy} onClick={seed}>{busy ? 'جارٍ التنفيذ...' : 'قراءة وكتابة عبر جلسة SUPER_ADMIN'}</button>{message && <p className="form-message">{message}</p>}{result && <div className="demo-seed-result"><p>أضيفت أقسام: {result.categoryAdds.length} · تم تجاوز موجود: {result.skippedCategories.length}</p><p>أضيفت منتجات: {result.productAdds.length} · تم تجاوز موجود: {result.skippedProducts.length}</p><p>قراءة لاحقة: {result.verified ? 'PASS' : 'FAIL'}</p></div>}</section></>
}
