import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  CreditCard, Smartphone, Banknote, Pencil, Check, X, ChevronDown,
  MapPin, Car, Zap, Fuel, Clock, User, Phone, Loader2, Landmark, ReceiptText, AlertTriangle,
  BadgeEuro, ShieldCheck, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { calculateSeverity, calculateQuote, type Quote, type QuoteLineKey } from '@/lib/pricingLogic'
import { submitOrder } from '@/lib/orders'
import { saveDispatch } from '@/lib/dispatchSession'
import { driveInfoToBase, MAX_SERVICE_KM, type DriveInfo } from '@/lib/geocode'

// Fixed payment details (not translated — these are real account identifiers).
const BANK = {
  paypal: 'kontakt@falschgetankt.info',
  holder: 'Ihsan Gerçek',
  name: 'Commerzbank',
  iban: 'DE42 3004 0000 0822 2416 00',
  bic: 'COBADEFFXXX',
}

export function OfferScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]
  const store = useAppStore()

  const [submitting, setSubmitting] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showTrust, setShowTrust] = useState(false)

  // Drive time + distance to our base; re-resolved if the location changes.
  const [driveInfo, setDriveInfo] = useState<DriveInfo | null>(null)
  useEffect(() => {
    let active = true
    setDriveInfo(null)
    driveInfoToBase(store.location || '').then((info) => {
      // Fallback to an in-range estimate if geocoding/routing fails.
      if (active) setDriveInfo(info ?? { minutes: 45, km: 0 })
    })
    return () => { active = false }
  }, [store.location])

  // Beyond the service radius we don't quote or dispatch.
  const outOfRange = !!driveInfo && driveInfo.km > MAX_SERVICE_KM

  // Recompute whenever the inputs that affect price change.
  const quote = useMemo<Quote | null>(
    () => (driveInfo == null || outOfRange ? null : calculateQuote(driveInfo.minutes, store.litres, store.engineStarted)),
    [driveInfo, outOfRange, store.litres, store.engineStarted],
  )

  useEffect(() => {
    if (quote) {
      store.setPrice(quote.gross)
      store.setEta(quote.eta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote])

  const severity = calculateSeverity(store.engineStarted)

  function startEdit(key: string, value: string) {
    setEditingKey(key)
    setDraft(value)
  }
  function saveEdit(set: (v: string) => void) {
    set(draft.trim())
    setEditingKey(null)
  }

  async function handleRequest() {
    if (submitting || !quote) return
    setSubmitting(true)
    const { id } = await submitOrder(
      {
        situation: store.situation,
        engine_started: store.engineStarted,
        litres: store.litres,
        location: store.location,
        vehicle: store.vehicle,
        contact_name: store.contactName.trim(),
        contact_phone: store.contactPhone.trim(),
        severity,
        price: quote.gross,
        eta_minutes: quote.eta,
        lang,
        vehicle_doc: store.vehicleDoc,
        vehicle_doc_url: store.vehicleDocUrl,
      },
      quote,
    )
    store.setOrderId(id)
    if (id) saveDispatch({ orderId: id, price: quote.gross, eta: quote.eta })
    navigate('/dispatch')
  }

  const summaryRows: {
    key: string; label: string; value: string; set: (v: string) => void
    icon: React.ElementType; options?: string[]; type?: string
  }[] = [
    { key: 'situation', label: t.offer.labels.situation, value: store.situation, set: store.setSituation, icon: Fuel, options: [...t.intake.chips.situation] },
    { key: 'engine', label: t.offer.labels.engineStarted, value: store.engineStarted, set: store.setEngineStarted, icon: Zap, options: [...t.intake.chips.engineStarted] },
    { key: 'litres', label: t.offer.labels.litres, value: store.litres, set: store.setLitres, icon: Fuel },
    { key: 'location', label: t.offer.labels.location, value: store.location, set: store.setLocation, icon: MapPin },
    { key: 'vehicle', label: t.offer.labels.vehicle, value: store.vehicle, set: store.setVehicle, icon: Car },
    { key: 'name', label: t.offer.contactName, value: store.contactName, set: store.setContactName, icon: User },
    { key: 'phone', label: t.offer.contactPhone, value: store.contactPhone, set: store.setContactPhone, icon: Phone, type: 'tel' },
  ]

  const paymentIcons = [CreditCard, Smartphone, Banknote]

  const severityBadgeClass = {
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-red-100 text-red-800 border-red-200',
  }[severity]

  // Localized line label, with the litre count appended for the per-litre items.
  function lineLabel(key: QuoteLineKey): string {
    const base = t.offer.quoteLines[key]
    if ((key === 'pumpDisposal' || key === 'delivery') && quote) return `${base} (${quote.litres} L)`
    return base
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

      {/* Summary — risk badge in the top-right corner; rows editable inline */}
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
                      {row.options ? (
                        <select
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                          className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {draft && !row.options.includes(draft) && <option value={draft}>{draft}</option>}
                          {row.options.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          type={row.type ?? 'text'}
                          autoFocus
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(row.set)
                            if (e.key === 'Escape') setEditingKey(null)
                          }}
                        />
                      )}
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
                      <Button variant="ghost" size="icon-xs" onClick={() => startEdit(row.key, row.value)} aria-label="Bearbeiten" className="shrink-0">
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

      {/* Out of service area — no quote, request blocked */}
      {outOfRange && driveInfo && (
        <Card size="sm">
          <CardContent className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <AlertTriangle className="size-4 shrink-0" />
              {t.offer.outOfRangeTitle}
            </p>
            <p className="text-sm text-muted-foreground">{t.offer.outOfRange(driveInfo.km)}</p>
          </CardContent>
        </Card>
      )}

      {!outOfRange && (
        <>
      {/* Cost breakdown — collapsed by default (progressive disclosure) */}
      <Card size="sm">
        <CardContent className="space-y-2">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex w-full items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ReceiptText className="size-4" />
              {t.offer.breakdownTitle}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-heading text-sm font-bold">
                {quote ? `€${quote.gross}` : '—'}
              </span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showBreakdown && (
            quote ? (
              <div className="space-y-1.5 pt-1">
                {quote.lines.map((line) => (
                  <div key={line.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{lineLabel(line.key)}</span>
                    <span className="tabular-nums whitespace-nowrap">€{line.amount}</span>
                  </div>
                ))}
                <div className="mt-1 space-y-1 border-t pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t.offer.netLabel}</span><span className="tabular-nums">€{quote.net}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t.offer.vatLabel}</span><span className="tabular-nums">€{quote.vat}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{t.offer.grossLabel}</span><span className="tabular-nums">€{quote.gross}</span>
                  </div>
                </div>
                <p className="pt-1 text-[11px] leading-tight text-muted-foreground">{t.offer.estimateNote}</p>
              </div>
            ) : (
              <p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t.offer.calculating}
              </p>
            )
          )}
        </CardContent>
      </Card>

      {/* Payment details — collapsed by default */}
      <Card size="sm">
        <CardContent className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPayment((v) => !v)}
            className="flex w-full items-center justify-between gap-2"
          >
            <span className="text-sm font-medium text-muted-foreground">{t.offer.paymentDetailsTitle}</span>
            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showPayment ? 'rotate-180' : ''}`} />
          </button>
          {showPayment && (
            <div className="space-y-3 pt-1">
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
              <div className="rounded-lg border bg-muted/40 p-2.5 space-y-1 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-foreground/80">
                  <Landmark className="size-3.5" /> {t.offer.bankTitle}
                </p>
                <p>PayPal: <span className="font-medium">{BANK.paypal}</span></p>
                <p>{BANK.holder} · {BANK.name}</p>
                <p>IBAN: <span className="font-medium tabular-nums">{BANK.iban}</span></p>
                <p>BIC: <span className="font-medium">{BANK.bic}</span></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      </div>

      {/* Fixed footer: price beside the action so they read as one unit */}
      <div className="border-t bg-background px-4 py-3">
        {outOfRange ? (
          <>
            <Button className="w-full h-12 text-base" disabled>
              {t.offer.cta}
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-amber-600">
              <AlertTriangle className="size-3.5 shrink-0" />
              {t.offer.outOfRangeTitle}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                {quote ? (
                  <>
                    <p className="font-heading text-2xl font-bold leading-none">€{quote.gross}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                      <Clock className="size-3 shrink-0 text-primary" />
                      {t.offer.driveTime(quote.eta)}
                    </p>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
                    <Loader2 className="size-4 animate-spin" /> {t.offer.calculating}
                  </p>
                )}
              </div>
              <Button className="flex-1 h-12 text-base" onClick={handleRequest} disabled={submitting || !quote}>
                {t.offer.cta}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setShowTrust(true)}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-green-100 bg-green-50/80 px-3 py-2.5 text-left transition hover:bg-green-100/60"
            >
              <ShieldCheck className="size-5 shrink-0 text-green-600" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-xs font-semibold text-green-800">{t.offer.trustHeadline}</span>
                <span className="block text-[11px] text-green-700/90">{t.offer.trustSub}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-green-600/70" />
            </button>
          </>
        )}
      </div>

      {/* Trust / "how it works" — a bottom drawer anchored to the content area
          (not the viewport), so it sits at the bottom of the phone card. */}
      {showTrust && (
        <>
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setShowTrust(false)}
            className="absolute inset-0 z-40 bg-black/25 drawer-fade"
          />
          <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-background p-4 shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.25)] drawer-up">
            <div className="flex items-center justify-between">
              <p className="font-heading text-base font-medium">{t.offer.trustTitle}</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowTrust(false)} aria-label="Schließen">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-3 space-y-3.5 pb-2 text-sm">
              {[
                { icon: BadgeEuro, text: t.offer.priceTitle },
                { icon: ShieldCheck, text: t.offer.disclaimer },
                { icon: Phone, text: t.offer.trustCall },
                { icon: CreditCard, text: t.offer.trustPayment },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-2.5">
                  <Icon className="size-4 shrink-0 text-green-600 mt-0.5" />
                  <span className="text-foreground/90">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
