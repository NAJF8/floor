import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { firebaseAuth, firebaseDatabase, googleProvider, SHOP_ID } from './firebase'

type AdminMembership = {
  uid?: string
  email?: string
  role?: string
  active?: boolean
  immutableBootstrap?: boolean
}

type SessionState = {
  loading: boolean
  user: User | null
  membership: AdminMembership | null
  error: string
}

const initialState: SessionState = { loading: true, user: null, membership: null, error: '' }

function useAdminSession() {
  const [state, setState] = useState<SessionState>(initialState)

  useEffect(() => onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      setState({ loading: false, user: null, membership: null, error: '' })
      return
    }

    try {
      const snapshot = await get(ref(firebaseDatabase, `shopMemberships/${user.uid}/${SHOP_ID}`))
      setState({
        loading: false,
        user,
        membership: snapshot.exists() ? snapshot.val() as AdminMembership : null,
        error: '',
      })
    } catch (error) {
      setState({ loading: false, user, membership: null, error: error instanceof Error ? error.message : 'تعذر التحقق من عضوية الإدارة.' })
    }
  }), [])

  return state
}

function AuthMessage({ children }: { children: ReactNode }) {
  return <main className="page"><div className="container narrow"><div className="demo-card admin-auth-card">{children}</div></div></main>
}

export function AdminGate({ children }: { children: ReactNode }) {
  const state = useAdminSession()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const login = async () => {
    setBusy(true)
    setActionError('')
    try {
      await signInWithPopup(firebaseAuth, googleProvider)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'تعذر تسجيل الدخول عبر Google.')
    } finally {
      setBusy(false)
    }
  }

  if (state.loading) return <AuthMessage><p>جارٍ التحقق من جلسة Firebase...</p></AuthMessage>

  if (!state.user) return <AuthMessage>
    <div className="eyebrow">منطقة الإدارة المحمية</div>
    <h1>تسجيل دخول Google مطلوب</h1>
    <p>لا يمنح تسجيل Google صلاحيات الإدارة تلقائياً. يجب أن توجد عضوية Firebase موثقة لهذا الحساب.</p>
    <button className="btn btn-dark full" disabled={busy} onClick={login}>{busy ? 'جارٍ فتح Google...' : 'تسجيل الدخول عبر Google'}</button>
    {actionError && <p className="auth-error">{actionError}</p>}
  </AuthMessage>

  const googleAccount = state.user.providerData.some((provider) => provider.providerId === 'google.com')
  const verifiedEmail = state.user.emailVerified && Boolean(state.user.email)
  const authorized = googleAccount && verifiedEmail && state.membership?.active === true && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER'].includes(state.membership.role || '')

  if (!authorized) return <AuthMessage>
    <div className="eyebrow">تم التعرف على الحساب</div>
    <h1>لا توجد صلاحية إدارة</h1>
    <p>الحساب: {state.user.email || 'بدون بريد'}</p>
    <p>Firebase UID الموثق: <code>{state.user.uid}</code></p>
    <p>لا يتم منح الدور من البريد أو من المتصفح. يجب إنشاء عضوية هذا UID عبر عملية provisioning موثوقة.</p>
    {state.error && <p className="auth-error">{state.error}</p>}
    <button className="btn btn-light full" onClick={() => signOut(firebaseAuth)}>تسجيل الخروج</button>
  </AuthMessage>

  return <>{children}</>
}
