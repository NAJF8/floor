import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAdminSession } from './adminAuth'
import { SHOP_ID } from './firebase'
import { subscribeMap } from './rtdb'

const links = [
  ['/', 'الرئيسية', 'home'], ['categories', 'الأقسام', 'grid'], ['products', 'المنتجات', 'box'], ['orders', 'الطلبات', 'cart'],
  ['inventory', 'المخزون', 'warehouse'], ['discounts', 'الخصومات', 'tag'], ['customers', 'العملاء', 'people'], ['delivery', 'التوصيل', 'truck'],
  ['payments', 'معلومات الدفع والتحويل', 'card'], ['homepage', 'الصفحة الرئيسية', 'layout'], ['settings', 'إعدادات المتجر', 'settings'], ['ai', 'مساعد AI', 'sparkle'],
  ['staff', 'الموظفون والصلاحيات', 'people'], ['reports', 'التقارير والسجلات', 'chart'], ['activity-logs', 'سجل النشاط', 'history'], ['import-export', 'الاستيراد والتصدير', 'upload'],
] as const

function Icon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>, grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>, box: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>, cart: <><path d="M3 4h2l2 11h10l3-8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>, warehouse: <><path d="m3 10 9-6 9 6v9H3Z" /><path d="M7 19v-5h4v5M14 19v-5h3v5" /></>, tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /></>, people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.5 2.4-5 5.5-5s5 1.5 5.5 5M16 11a3 3 0 1 0 0-6M16 15c2.5.2 4 1.7 4.5 5" /></>, truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></>, card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>, layout: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M9 10h11" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-1.8-3.1-2.4 1a7 7 0 0 0-2-1.2L14.4 3h-3.6l-.4 3a7 7 0 0 0-2 1.2l-2.4-1-1.8 3.1 2 1.5A7 7 0 0 0 6 12c0 .4.1.8.1 1.2l-2 1.5 1.8 3.1 2.4-1a7 7 0 0 0 2 1.2l.4 3h3.6l.4-3a7 7 0 0 0 2-1.2l2.4 1 1.8-3.1-2-1.5c.1-.4.1-.8.1-1.2Z" /></>, sparkle: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 19l-2.4-.6L19 16Z" /></>, chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>, history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>, upload: <><path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5" /></>, menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>, search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>, bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>, moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" />,
  }
  return <svg {...common}>{paths[name] || paths.grid}</svg>
}

export function AdminLayout() {
  const session = useAdminSession(); const navigate = useNavigate(); const [menuOpen, setMenuOpen] = useState(false); const [dark, setDark] = useState(false); const [accountOpen, setAccountOpen] = useState(false); const [avatarFailed, setAvatarFailed] = useState(false); const [settings, setSettings] = useState<Record<string, unknown>>({})
  useEffect(() => subscribeMap<Record<string, unknown>>(`shops/${SHOP_ID}/public/settings`, setSettings), [])
  const closeMenu = () => setMenuOpen(false)
  const displayName = session.user?.displayName || session.user?.email?.split('@')[0] || 'مدير المتجر'
  const configuredLogo = typeof settings.logoUrl === 'string' && /^(https?:\/\/|\/)/.test(settings.logoUrl.trim()) ? settings.logoUrl.trim() : `${import.meta.env.BASE_URL}alasas-logo.jpg`
  return <div className={`admin-shell${dark ? ' dark-mode' : ''}`}>
    {menuOpen && <button className="sidebar-backdrop" aria-label="إغلاق القائمة" onClick={closeMenu} />}
    <aside id="admin-sidebar" className={`sidebar${menuOpen ? ' is-open' : ''}`}>
      <div className="sidebar-brand"><NavLink to="/" className="brand" onClick={closeMenu}><img src={configuredLogo} alt="شعار الأساس" /></NavLink><button className="sidebar-collapse" aria-label="القائمة"><Icon name="menu" /></button></div>
      <nav className="nav-list" aria-label="أقسام الإدارة">{links.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={closeMenu}><Icon name={icon} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-card"><img src={`${import.meta.env.BASE_URL}alasas-logo.jpg`} alt="" /><b>AL ASAS</b><small>من الأساس تبدأ الفكرة</small></div>
      <div className="sidebar-footer"><span className="session-name">{displayName}</span><small>{session.membership?.role || 'ADMIN'}</small><button onClick={async () => { await signOut(auth); closeMenu(); navigate('/') }}>تسجيل الخروج</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon name="menu" /></button><div className="topbar-search"><input aria-label="بحث" placeholder="ابحث في المنتجات، الطلبات، العملاء ..." /><Icon name="search" /></div><div className="topbar-actions"><button className="icon-button" aria-label="الوضع الليلي" onClick={() => setDark(value => !value)}><Icon name="moon" /></button><button className="icon-button" aria-label="الإشعارات"><Icon name="bell" /></button><div className="account-wrap"><button className="user-menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}><span className="avatar">{session.user?.photoURL && !avatarFailed ? <img src={session.user.photoURL} alt="" onError={() => setAvatarFailed(true)} /> : displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{session.membership?.role || 'ADMIN'}</small></span><span className="chevron">⌄</span></button>{accountOpen && <div className="account-menu"><b>{displayName}</b><span>{session.user?.email || '—'}</span><small>{session.membership?.role || 'ADMIN'}</small><button onClick={async () => { await signOut(auth); setAccountOpen(false); navigate('/') }}>تسجيل الخروج</button></div>}</div></div></header>
      <div className="page-content"><Outlet /></div>
    </main>
  </div>
}
