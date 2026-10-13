import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { AdminGate, useAdminSession } from './adminAuth'
import { auth } from './firebase'
import './styles.css'

const sections = ['الرئيسية', 'الطلبات', 'المنتجات', 'التصنيفات', 'المخزون', 'العروض والخصومات', 'الموظفون والصلاحيات', 'التقارير والسجل', 'إعدادات المتجر', 'إعدادات مساعد AI']
const metrics = [['مبيعات اليوم', '١,٢٨٥,٠٠٠ د.ع', '+12.8%'], ['طلبات جديدة', '٢٤', '+8.4%'], ['قيد التجهيز', '٠٨', 'هذا اليوم'], ['منتجات منخفضة', '٠٣', 'تحتاج مراجعة']]

function Dashboard() {
  const session = useAdminSession(); const [section, setSection] = useState(sections[0])
  return <main className="admin-app"><aside><Link className="brand" to="/"><img src={`${import.meta.env.BASE_URL}alasas-logo.jpg`} alt="AL ASAS" /><span>مركز إدارة المتجر<small>AL ASAS COMMERCE</small></span></Link><nav>{sections.map((item) => <button className={item === section ? 'active' : ''} onClick={() => setSection(item)} key={item}>{item}</button>)}</nav><div className="identity"><b>{session.user?.displayName || session.user?.email || 'مدير المتجر'}</b><small>{session.membership?.role}</small></div></aside><section className="content"><header><div><span className="eyebrow">مركز الإدارة /</span><h1>{section}</h1></div><div><a className="secondary" href="https://najf8.github.io/floor/">عرض المتجر</a><button className="secondary" onClick={() => signOut(auth)}>تسجيل الخروج</button></div></header><div className="notice">هذه لوحة الإدارة مستقلة عن متجر الزبائن، وتستخدم Firebase UID والعضوية الموثقة لكل عملية.</div><div className="metrics">{metrics.map(([label, value, change]) => <article key={label}><span>{label}</span><b>{value}</b><small>{change}</small></article>)}</div><div className="grid"><article className="panel"><h2>نظرة على المبيعات</h2><div className="bars">{[46,72,52,88,62,78,96].map((height, index) => <i style={{height: `${height}%`}} key={index} />)}</div></article><article className="panel"><h2>آخر الطلبات</h2>{['AL-0182 — باقة الورد الأحمر — قيد التجهيز','AL-0181 — بوكس ورد وشوكولاتة — تم التأكيد','AL-0180 — باقة التخرج الوردية — جاهز للتوصيل'].map((order) => <p className="order" key={order}>{order}</p>)}</article></div></section></main>
}

function App() { return <AdminGate><Dashboard /></AdminGate> }
createRoot(document.getElementById('root')!).render(<BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter>)
