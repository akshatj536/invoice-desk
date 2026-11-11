import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppModeProvider, useAppMode } from './app/mode'
import { AppShell } from './components/v2/shell'
import { ToastProvider } from './components/v2/ui'
import Exceptions from './pages/v2/Exceptions'
import HowItWorks from './pages/v2/HowItWorks'
import Inbox from './pages/v2/Inbox'
import Invoices from './pages/v2/Invoices'
import PurchaseOrders from './pages/v2/PurchaseOrders'
import SampleInvoices from './pages/v2/SampleInvoices'
import Settings from './pages/v2/Settings'
import Vendors from './pages/v2/Vendors'
import InvoiceDetail from './pages/v2/InvoiceDetail'

function DemoOnly({ children }: { children: ReactNode }) {
  const { demo } = useAppMode()
  return demo ? <>{children}</> : <Navigate to="/inbox" replace />
}

function RunRedirect() {
  const { id } = useParams()
  return <Navigate to={`/invoices/${id}`} replace />
}

export default function App() {
  return (
    <AppModeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/inbox" replace />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="exceptions" element={<Exceptions />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="purchase-orders" element={<PurchaseOrders />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="settings" element={<Settings />} />
              <Route path="demo/samples" element={<DemoOnly><SampleInvoices /></DemoOnly>} />
              <Route path="demo/how-it-works" element={<DemoOnly><HowItWorks /></DemoOnly>} />
              {/* v1 routes */}
              <Route path="runs" element={<Navigate to="/invoices" replace />} />
              <Route path="runs/:id" element={<RunRedirect />} />
              <Route path="review" element={<Navigate to="/exceptions" replace />} />
              <Route path="records" element={<Navigate to="/purchase-orders" replace />} />
              <Route path="how" element={<Navigate to="/demo/how-it-works" replace />} />
              <Route path="*" element={<Navigate to="/inbox" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppModeProvider>
  )
}
