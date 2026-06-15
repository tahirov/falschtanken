import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CreditCard, Smartphone, Banknote, Pencil,
  MapPin, Car, Zap, Fuel, Clock,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { calculateSeverity, calculatePrice, generateEta } from '@/lib/pricingLogic'

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

  function editStep(step: number) {
    store.setCurrentStep(step)
    navigate('/intake')
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
    <div className="flex flex-col flex-1 overflow-y-auto px-4 py-4 gap-4">

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.offer.summaryTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summaryRows.map((row) => {
            const Icon = row.icon
            return (
              <div key={row.label} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{row.label}</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
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
        </CardContent>
      </Card>

      {/* Severity badge */}
      <div className="flex justify-center">
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severityBadgeClass}`}>
          {t.offer.severity[severity]}
        </span>
      </div>

      {/* Price + ETA card */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-3xl font-bold">€{price}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.offer.priceTitle}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Clock className="size-4 text-primary" />
                <p className="font-heading text-xl font-bold">{eta} min</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.offer.eta(eta)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{t.offer.paymentTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {t.offer.paymentMethods.map((method, i) => {
            const Icon = paymentIcons[i]
            return (
              <div key={method} className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{method}</span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="space-y-2 pb-2">
        <Button
          className="w-full"
          size="lg"
          onClick={() => navigate('/dispatch')}
        >
          {t.offer.cta}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => navigate(-1)}
        >
          {t.offer.back}
        </Button>
        <p className="text-center text-xs text-muted-foreground pt-1">{t.offer.disclaimer}</p>
      </div>
    </div>
  )
}
