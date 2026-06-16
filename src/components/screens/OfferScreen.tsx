import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  CreditCard, Smartphone, Banknote, Pencil, Check, X,
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

  // Inline edit: tapping a row's pencil edits it in place (no wizard restart).
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  function startEdit(key: string, value: string) {
    setEditingKey(key)
    setDraft(value)
  }
  function saveEdit(set: (v: string) => void) {
    set(draft.trim())
    setEditingKey(null)
  }

  async function handleRequest() {
    if (submitting) return
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

  const summaryRows: { key: string; label: string; value: string; set: (v: string) => void; icon: React.ElementType }[] = [
    { key: 'situation', label: t.offer.labels.situation, value: store.situation, set: store.setSituation, icon: Fuel },
    { key: 'engine', label: t.offer.labels.engineStarted, value: store.engineStarted, set: store.setEngineStarted, icon: Zap },
    { key: 'litres', label: t.offer.labels.litres, value: store.litres, set: store.setLitres, icon: Fuel },
    { key: 'location', label: t.offer.labels.location, value: store.location, set: store.setLocation, icon: MapPin },
    { key: 'vehicle', label: t.offer.labels.vehicle, value: store.vehicle, set: store.setVehicle, icon: Car },
    { key: 'name', label: t.offer.contactName, value: store.contactName, set: store.setContactName, icon: User },
    { key: 'phone', label: t.offer.contactPhone, value: store.contactPhone, set: store.setContactPhone, icon: Phone },
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
              const editing = editingKey === row.key
              return (
                <div key={row.key} className="flex items-center justify-between gap-2 min-h-8">
                  <div className="flex items-center gap-2 shrink-0">
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{row.label}</span>
                  </div>
                  {editing ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(row.set)
                          if (e.key === 'Escape') setEditingKey(null)
                        }}
                      />
                      <Button variant="ghost" size="icon-xs" onClick={() => saveEdit(row.set)} aria-label="Speichern" className="shrink-0 text-primary">
                        <Check className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setEditingKey(null)} aria-label="Abbrechen" className="shrink-0 text-muted-foreground">
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 min-w-0">
                      <span className="text-sm font-medium truncate text-right">{row.value || '—'}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startEdit(row.key, row.value)}
                        aria-label="Bearbeiten"
                        className="shrink-0"
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
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

      {/* Fixed footer: the price sits right beside the action so they read as a
          single "this costs X — request it" unit. */}
      <div className="border-t bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <p className="font-heading text-2xl font-bold leading-none">€{price}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
              <Clock className="size-3 shrink-0 text-primary" />
              {eta} min
            </p>
          </div>
          <Button
            className="flex-1 h-12 text-base"
            onClick={handleRequest}
            disabled={submitting}
          >
            {t.offer.cta}
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] leading-tight text-muted-foreground">
          {t.offer.priceTitle} · {t.offer.disclaimer}
        </p>
      </div>
    </div>
  )
}
