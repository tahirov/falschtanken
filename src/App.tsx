import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/screens/LandingScreen'
import { IntakeScreen } from '@/components/screens/IntakeScreen'
import { AiIntakeScreen } from '@/components/screens/AiIntakeScreen'
import { OfferScreen } from '@/components/screens/OfferScreen'
import { DispatchScreen } from '@/components/screens/DispatchScreen'
import { AdminPage } from '@/components/screens/AdminPage'
import {
  HowItWorksPage, PriceCalcPage, PaymentPage, ContactPage,
  ImpressumPage, DatenschutzPage, AgbPage,
} from '@/components/screens/InfoPages'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/intake" element={<IntakeScreen />} />
          <Route path="/chat" element={<AiIntakeScreen />} />
          <Route path="/offer" element={<OfferScreen />} />
          <Route path="/dispatch" element={<DispatchScreen />} />
          {/* Customer info & legal pages */}
          <Route path="/so-funktioniert-es" element={<HowItWorksPage />} />
          <Route path="/preisberechnung" element={<PriceCalcPage />} />
          <Route path="/zahlung" element={<PaymentPage />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/datenschutz" element={<DatenschutzPage />} />
          <Route path="/agb" element={<AgbPage />} />
          {/* Admin (login → orders), reached via URL only */}
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/orders" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
