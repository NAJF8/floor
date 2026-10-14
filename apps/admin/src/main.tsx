import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminGate } from './adminAuth'
import { AdminLayout } from './layout'
import { AIAssistantPage, CategoriesPage, CustomersPage, DashboardPageEnhanced, DeliveryPage, DiscountsPage, HomePage, ImportExportPage, InventoryPage, NotFoundPage, OrdersPage, PaymentMethodsPage, ProductsPage, ReportsPageEnhanced, SettingsPage, StaffPage } from './pages'
import './styles.css'

function App() {
  return <AdminGate><BrowserRouter basename={import.meta.env.BASE_URL}><Routes><Route element={<AdminLayout />}><Route index element={<DashboardPageEnhanced />} /><Route path="categories" element={<CategoriesPage />} /><Route path="products" element={<ProductsPage />} /><Route path="orders" element={<OrdersPage />} /><Route path="inventory" element={<InventoryPage />} /><Route path="discounts" element={<DiscountsPage />} /><Route path="customers" element={<CustomersPage />} /><Route path="delivery" element={<DeliveryPage />} /><Route path="payments" element={<PaymentMethodsPage />} /><Route path="homepage" element={<HomePage />} /><Route path="settings" element={<SettingsPage />} /><Route path="ai" element={<AIAssistantPage />} /><Route path="staff" element={<StaffPage />} /><Route path="reports" element={<ReportsPageEnhanced />} /><Route path="import-export" element={<ImportExportPage />} /><Route path="not-found" element={<NotFoundPage />} /><Route path="*" element={<Navigate to="/not-found" replace />} /></Route></Routes></BrowserRouter></AdminGate>
}

createRoot(document.getElementById('root')!).render(<App />)
