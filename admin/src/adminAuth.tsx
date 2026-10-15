import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { httpsCallable } from 'firebase/functions'
import { auth, getFirebaseDatabase, googleProvider, SHOP_ID } from './firebase'
import { getFirebaseFunctions } from './firebase'

const localAdminEmulatorLogin = import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  && import.meta.env.VITE_ENABLE_ADMIN_E2E_LOGIN === 'true'
const localAdminEmail = import.meta.env.VITE_E2E_ADMIN_EMAIL || ''
const localAdminPassword = import.meta.env.VITE_E2E_ADMIN_PASSWORD || ''

type Membership = { role?: string; active?: boolean; permissions?: Record<string, boolean> }
export type AdminSession = { loading: boolean; user: User | null; membership: Membership | null; error: string }
export function useAdminSession() { const [state, setState] = useState<AdminSession>({ loading: true, user: null, membership: null, error: '' }); useEffect(() => onAuthStateChanged(auth, async (user) => { if (!user) return setState({ loading: false, user: null, membership: null, error: '' }); try { let snapshot = await get(ref(getFirebaseDatabase(), `shopMemberships/${user.uid}/${SHOP_ID}`)); if (!snapshot.exists() && user.providerData.some((provider) => provider.providerId === 'google.com') && user.emailVerified) { try { await httpsCallable(getFirebaseFunctions(), 'acceptStaffInvitation')({}); snapshot = await get(ref(getFirebaseDatabase(), `shopMemberships/${user.uid}/${SHOP_ID}`)) } catch { /* no matching invite is a normal denied state */ } } setState({ loading: false, user, membership: snapshot.exists() ? snapshot.val() as Membership : null, error: '' }) } catch (error) { setState({ loading: false, user, membership: null, error: error instanceof Error ? error.message : 'تعذر الاتصال بخدمة Firebase.' }) } }), []); return state }

function GoogleIcon() { return <svg className="google-icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.26Z" /><path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.67Z" /><path fill="#FBBC05" d="M6.54 13.75A5.85 5.85 0 0 1 6.23 12c0-.61.1-1.2.31-1.75V7.72H3.3A9.74 9.74 0 0 0 2.26 12c0 1.57.38 3.05 1.04 4.28l3.24-2.53Z" /><path fill="#EA4335" d="M12 6.22c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.3 14.63 2.33 12 2.33a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 7.94 9.46 6.22 12 6.22Z" /></svg> }
function FeatureIcon({ type }: { type: 'people' | 'shield' | 'chart' }) { if (type === 'people') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5" /><path d="M16 5.5a3 3 0 0 1 0 5.7M17.5 15c1.8.5 2.8 2 3 4.5" /></svg>; if (type === 'shield') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 20 6v5.5c0 4.7-3 7.7-8 9.5-5-1.8-8-4.8-8-9.5V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>; return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg> }
function FeatureStrip() { return <div className="login-features"><div className="login-feature"><span><FeatureIcon type="people" /></span><strong>للمسؤولين فقط</strong></div><div className="login-feature"><span><FeatureIcon type="shield" /></span><strong>وصول آمن<br />ومحمي</strong></div><div className="login-feature"><span><FeatureIcon type="chart" /></span><strong>إدارة متكاملة<br />لمتجرك</strong></div></div> }
function AuthCard({ children }: { children: ReactNode }) { return <main className="login-page"><div className="login-decor login-decor-one" aria-hidden="true" /><div className="login-decor login-decor-two" aria-hidden="true" /><section className="login-panel"><div className="login-card"><div className="login-brand"><img src={`${import.meta.env.BASE_URL}alasas-logo.jpg`} alt="شعار الأساس AL ASAS" /></div>{children}<footer>AL ASAS <span>—</span> من الأساس تبدأ الفكرة</footer></div></section></main> }

export function AdminGate({ children }: { children: ReactNode }) {
  const state = useAdminSession(); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const login = async () => { setBusy(true); setError(''); try { await signInWithPopup(auth, googleProvider) } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول. تحقق من الاتصال وحاول مرة أخرى.') } finally { setBusy(false) } }
  const loginLocalAdmin = async () => { setBusy(true); setError(''); try { if (!localAdminEmail || !localAdminPassword) throw new Error('E2E Admin credentials are not configured.'); await signInWithEmailAndPassword(auth, localAdminEmail, localAdminPassword) } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول المحلي للاختبار.') } finally { setBusy(false) } }
  if (state.loading) return <AuthCard><div className="login-copy login-state"><h1>جارٍ التحقق من الحساب</h1><p>نؤكد صلاحية الجلسة قبل فتح مركز الإدارة.</p><div className="loader" /></div></AuthCard>
  if (!state.user) return <AuthCard><div className="login-copy"><h1>مرحباً بعودتك</h1><p>سجّل الدخول للوصول إلى مركز إدارة متجرك.</p></div><button className="google-button" disabled={busy} onClick={login}><GoogleIcon /><span>{busy ? 'تسجيل الدخول جارٍ...' : 'المتابعة باستخدام Google'}</span><span className="google-arrow" aria-hidden="true">←</span></button>{localAdminEmulatorLogin && <><p className="login-note">مسار E2E محلي فقط — Auth وRTDB Emulator مطلوبان، ولا يعمل في Production.</p><button className="secondary full" disabled={busy} onClick={loginLocalAdmin}>{busy ? 'جارٍ الدخول...' : 'دخول Admin Emulator (E2E)'}</button></>}<FeatureStrip />{error && <div className="error-box login-error">تعذر تسجيل الدخول. تحقق من الاتصال وحاول مرة أخرى.</div>}</AuthCard>
  const googleAccount = state.user.providerData.some((provider) => provider.providerId === 'google.com')
  const localEmulatorAccount = localAdminEmulatorLogin && state.user.providerData.some((provider) => provider.providerId === 'password')
  const verifiedEmail = state.user.emailVerified && Boolean(state.user.email)
  const authorized = ((googleAccount && verifiedEmail) || localEmulatorAccount) && state.membership?.active === true && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER'].includes(state.membership.role || '')
  if (!authorized) return <AuthCard><div className="login-copy login-state"><h1>الحساب غير مخوّل</h1><p>هذا الحساب لا يملك عضوية إدارية نشطة لهذا المتجر.</p></div><FeatureStrip />{state.error && <div className="error-box login-error">تعذر التحقق من الصلاحية. حاول لاحقاً.</div>}<button className="secondary login-signout" onClick={() => signOut(auth)}>تسجيل الخروج</button></AuthCard>
  return <>{children}</>
}
