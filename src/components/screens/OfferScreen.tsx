import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CreditCard, Smartphone, Banknote, Pencil,
  MapPin, Car, Zap, Fuel, Clock, User, Phone,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { calculateSeverity, calculatePrice, generateEta } from '@/lib/pricingLogic'
import { submitOrder } from '@/lib/orders'
import { saveDispatch } from '@/lib/dispatchSession'

export function OfferScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]
  const store = useAppStore()
  const [eta, setEta] = useState(store.eta || 0)
  const [price, setPrice] = useState(store.price || 150)

  useEffect(() => {
    const generatedEta = generateEta()
    const calculatedPrice = calculatePrice(store.engineStarted)
    setEta(generatedEta)
    setPrice(calculatedPrice)
    store.setEta(generatedEta)
    store.setPrice(calculatedPrice)
  }, [])

  const severity = calculateSeverity(store.engineStarted)
  const [submitting, setSubmitting] = useState(false)

  function editStep(step: number) {
    store.setCurrentStep(step)
    navigate('/intake')
  }

  const contactComplete = store.contactName.trim() !== '' && store.contactPhone.trim() !== ''

  async function handleRequest() {
    if (submitting || !contactComplete) return
    setSubmitting(true)
    // Submit via the edge function so the operator is notified on Telegram (with
    // a fallback insert inside submitOrder if it's unreachable). Don't block the
    // customer funnel on a backend hiccup — proceed to dispatch either way.
    const { id } = await submitOrder({
      situation: store.situation,
      engine_started: store.engineStarted,
      litres: store.litres,
      location: store.location,
      vehicle: store.vehicle,
      contact_name: store.contactName.trim(),
      contact_phone: store.contactPhone.trim(),
      severity,
      price,
      eta_minutes: eta,
      lang,
      vehicle_doc: store.vehicleDoc,
      vehicle_doc_url: store.vehicleDocUrl,
    })
    store.setOrderId(id)
    if (id) saveDispatch({ orderId: id, price, eta })
    navigate('/dispatch')
  }

  const summaryRows: { label: string; value: string; step: number; icon: React.ElementType }[] = [
    { label: t.offer.labels.situation, value: store.situation, step: 0, icon: Fuel },
    { label: t.offer.labels.engineStarted, value: store.engineStarted, step: 1, icon: Zap },
    { label: t.offer.labels.litres, value: store.litres, step: 2, icon: Fuel },
    { label: t.offer.labels.location, value: store.location, step: 3, icon: MapPin },
    { label: t.offer.labels.vehicle, value: store.vehicle, step: 4, icon: Car },
  ]

  const paymentIcons = [CreditCard, Smartphone, Banknote]

  const severityBadgeClass = {
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-red-100 text-red-800 border-red-200',
  }[severity]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

      {/* Summary — risk badge pinned to the card's top-right corner */}
      <Card size="sm">
        <CardContent className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-base font-medium min-w-0 truncate">{t.offer.summaryTitle}</p>
            <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${severityBadgeClass}`}>
              {t.offer.severity[severity]}
            </span>
          </div>
          <div className="space-y-2">
            {summaryRows.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 shrink-0">
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate text-right">{row.value || '—'}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => editStep(row.step)}
                      aria-label="Bearbeiten"
                      className="shrink-0"
                    >
                      <Pencil className="size-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Price + ETA */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-3xl font-bold leading-none">€{price}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.offer.priceTitle}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Clock className="size-4 text-primary" />
                <p className="font-heading text-xl font-bold">{eta} min</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t.offer.eta(eta)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact details — above payment so both fields sit just over the action */}
      <Card size="sm">
        <CardContent className="space-y-2.5">
          <p className="text-sm font-medium text-muted-foreground">{t.offer.contactTitle}</p>
          <div className="space-y-1.5">
            <Label htmlFor="contact-name" className="flex items-center gap-1.5 text-xs">
              <User className="size-3.5 text-muted-foreground" />
              {t.offer.contactName}
            </Label>
            <Input
              id="contact-name"
              autoComplete="name"
              value={store.contactName}
              onChange={(e) => store.setContactName(e.target.value)}
              placeholder={t.offer.contactNamePlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone" className="flex items-center gap-1.5 text-xs">
              <Phone className="size-3.5 text-muted-foreground" />
              {t.offer.contactPhone}
            </Label>
            <Input
              id="contact-phone"
              type="tel"
              autoComplete="tel"
              value={store.contactPhone}
              onChange={(e) => store.setContactPhone(e.target.value)}
              placeholder={t.offer.contactPhonePlaceholder}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment methods (informational) */}
      <Card size="sm">
        <CardContent className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t.offer.paymentTitle}</p>
          <div className="space-y-1.5">
            {t.offer.paymentMethods.map((method, i) => {
              const Icon = paymentIcons[i]
              return (
                <div key={method} className="flex items-center gap-2.5">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{method}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      </div>

      {/* Compact fixed footer: primary action + a slim note. Back lives in the
          header (chevron), so no redundant button here. */}
      <div className="border-t bg-background px-4 py-2.5 space-y-1.5">
        <Button
          className="w-full"
          size="lg"
          onClick={handleRequest}
          disabled={submitting || !contactComplete}
        >
          {t.offer.cta}
        </Button>
        <p className="text-center text-[11px] leading-tight text-muted-foreground">{t.offer.disclaimer}</p>
      </div>
    </div>
  )
}
