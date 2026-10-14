import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { auth, database, googleProvider, SHOP_ID } from './firebase'

type Membership = { role?: string; active?: boolean; uid?: string; email?: string; permissions?: Record<string, boolean> }

export function useAdminSession() {
  const [state, setState] = useState<{ loading: boolean; user: User | null; membership: Membership | null; error: string }>({ loading: true, user: null, membership: null, error: '' })
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setState({ loading: false, user: null, membership: null, error: '' })
    try {
      const snapshot = await get(ref(database, `shopMemberships/${user.uid}/${SHOP_ID}`))
      setState({ loading: false, user, membership: snapshot.exists() ? snapshot.val() as Membership : null, error: '' })
    } catch (error) {
      setState({ loading: false, user, membership: null, error: error instanceof Error ? error.message : 'تعذر التحقق من العضوية.' })
    }
  }), [])
  return state
}

function Message({ children }: { children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card">{children}</section></main>
}

export function AdminGate({ children }: { children: ReactNode }) {
  const state = useAdminSession(); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState('')
  const login = async () => { setBusy(true); setActionError(''); try { await signInWithPopup(auth, googleProvider) } catch (error) { setActionError(error instanceof Error ? error.message : 'تعذر تسجيل الدخول عبر Google.') } finally { setBusy(false) } }
  if (state.loading) return <Message><p>جارٍ التحقق من جلسة Firebase...</p></Message>
  if (!state.user) return <Message><span className="eyebrow">منطقة الإدارة المحمية</span><h1>تسجيل دخول Google مطلوب</h1><p>لا يمنح تسجيل Google صلاحيات الإدارة تلقائياً. يجب أن توجد عضوية Firebase موثقة لهذا الحساب.</p><button className="primary" disabled={busy} onClick={login}>{busy ? 'جارٍ فتح Google...' : 'تسجيل الدخول عبر Google'}</button>{actionError && <p className="error">{actionError}</p>}</Message>
  const google = state.user.providerData.some((provider) => provider.providerId === 'google.com')
  const authorized = google && state.user.emailVerified && Boolean(state.user.email) && state.membership?.active === true && ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER'].includes(state.membership?.role || '')
  if (!authorized) return <Message><span className="eyebrow">تم التعرف على الحساب</span><h1>لا توجد صلاحية إدارة</h1><p>الحساب: {state.user.email || 'بدون بريد'}</p><p>Firebase UID: <code>{state.user.uid}</code></p><p>لا يتم منح الدور من البريد أو من المتصفح. يجب إنشاء عضوية هذا UID عبر عملية provisioning موثوقة.</p>{state.error && <p className="error">{state.error}</p>}<button className="secondary" onClick={() => signOut(auth)}>تسجيل الخروج</button></Message>
  return <>{children}</>
}
