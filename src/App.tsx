import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/screens/LandingScreen'
import { IntakeScreen } from '@/components/screens/IntakeScreen'
import { OfferScreen } from '@/components/screens/OfferScreen'
import { DispatchScreen } from '@/components/screens/DispatchScreen'
import { OrdersScreen } from '@/components/screens/OrdersScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/intake" element={<IntakeScreen />} />
          <Route path="/offer" element={<OfferScreen />} />
          <Route path="/dispatch" element={<DispatchScreen />} />
          <Route path="/admin/orders" element={<OrdersScreen />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
