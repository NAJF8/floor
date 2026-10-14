import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAdminSession } from './adminAuth'

const links = [['/', 'الرئيسية'], ['categories', 'الأقسام'], ['products', 'المنتجات'], ['orders', 'الطلبات'], ['inventory', 'المخزون'], ['discounts', 'الخصومات'], ['customers', 'العملاء'], ['delivery', 'التوصيل'], ['payments', 'معلومات الدفع والتحويل'], ['homepage', 'الصفحة الرئيسية'], ['settings', 'إعدادات المتجر'], ['ai', 'مساعد AI'], ['staff', 'الموظفون والصلاحيات'], ['reports', 'التقارير والسجلات'], ['import-export', 'الاستيراد والتصدير']] as const

export function AdminLayout() { const session = useAdminSession(); const navigate = useNavigate(); return <div className="admin-shell"><aside className="sidebar"><NavLink to="/" className="brand"><img src={`${import.meta.env.BASE_URL}alasas-logo.jpg`} alt="شعار الأساس" /><span>مركز إدارة المتجر<small>AL ASAS COMMERCE</small></span></NavLink><nav aria-label="أقسام الإدارة">{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>{label}</NavLink>)}</nav><div className="sidebar-footer"><b>{session.user?.displayName || session.user?.email || 'مدير المتجر'}</b><small>{session.membership?.role}</small><button onClick={async () => { await signOut(auth); navigate('/') }}>تسجيل الخروج</button></div></aside><main className="page-content"><Outlet /></main></div> }
