import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppModeProvider, useAppMode } from './app/mode'
import { AppShell, Page, PageHeader } from './components/v2/shell'
import { EmptyState, ToastProvider } from './components/v2/ui'
import Inbox from './pages/v2/Inbox'
import InvoiceDetail from './pages/v2/InvoiceDetail'

function Stub({ title }: { title: string }) {
  return <><PageHeader title={title} /><Page><EmptyState>Not built yet.</EmptyState></Page></>
}

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
              <Route path="exceptions" element={<Stub title="Exceptions" />} />
              <Route path="invoices" element={<Stub title="Invoices" />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="purchase-orders" element={<Stub title="Purchase orders" />} />
              <Route path="vendors" element={<Stub title="Vendors" />} />
              <Route path="settings" element={<Stub title="Settings" />} />
              <Route path="demo/samples" element={<DemoOnly><Stub title="Sample invoices" /></DemoOnly>} />
              <Route path="demo/how-it-works" element={<DemoOnly><Stub title="How it works" /></DemoOnly>} />
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
