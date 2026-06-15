import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Car, Send, Clock, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { runIntakeAgent, type AgentMessage, type AgentFields } from '@/lib/intakeAgent'
import { calculateQuote, type Quote } from '@/lib/pricingLogic'
import { submitOrder } from '@/lib/orders'

export function AiIntakeScreen() {
  const navigate = useNavigate()
  const store = useAppStore()
  const lang = store.lang
  const t = translations[lang]

  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, quote])

  function applyFields(f: AgentFields) {
    if (f.situation) store.setSituation(f.situation)
    if (f.engineStarted) store.setEngineStarted(f.engineStarted)
    if (f.litres) store.setLitres(f.litres)
    if (f.location) store.setLocation(f.location)
    if (f.vehicle) store.setVehicle(f.vehicle)
    if (f.contactName) store.setContactName(f.contactName)
    if (f.contactPhone) store.setContactPhone(f.contactPhone)
  }

  async function send() {
    const text = input.trim()
    if (!text || busy || quote) return
    const next: AgentMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    const { result, error } = await runIntakeAgent(next, lang)
    setBusy(false)
    if (error || !result) {
      setMessages([...next, { role: 'assistant', content: t.aiIntake.error }])
      return
    }
    applyFields(result.fields)
    setMessages([...next, { role: 'assistant', content: result.reply || '…' }])
    if (result.complete) {
      // Build the quote from the freshly collected case and show it in-thread.
      const q = calculateQuote(
        result.fields.engineStarted ?? store.engineStarted,
        result.fields.litres ?? store.litres,
      )
      store.setPrice(q.total)
      store.setEta(q.eta)
      setQuote(q)
    }
  }

  async function confirmOrder() {
    if (!quote || submitting) return
    setSubmitting(true)
    await submitOrder(
      {
        situation: store.situation,
        engine_started: store.engineStarted,
        litres: store.litres,
        location: store.location,
        vehicle: store.vehicle,
        contact_name: store.contactName.trim(),
        contact_phone: store.contactPhone.trim(),
        severity: quote.severity,
        price: quote.total,
        eta_minutes: quote.eta,
        lang,
      },
      quote,
    )
    navigate('/dispatch')
  }

  // The static greeting leads the thread; the live conversation follows.
  const bubbles: AgentMessage[] = [{ role: 'assistant', content: t.aiIntake.greeting }, ...messages]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {b.role === 'assistant' && (
              <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Car className="size-3.5 text-primary-foreground" />
              </div>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-snug whitespace-pre-wrap ${
                b.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}
            >
              {b.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
              <Car className="size-3.5 text-primary-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-1.5 text-sm">
              <span className="shimmer-text font-medium">{t.aiIntake.analyzing}</span>
              <span className="flex gap-0.5">
                <span className="size-1 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s]" />
                <span className="size-1 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s]" />
                <span className="size-1 rounded-full bg-muted-foreground/70 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        {quote && <QuoteCard quote={quote} />}

        <div ref={endRef} />
      </div>

      {quote ? (
        <div className="px-4 pb-4 pt-2 border-t space-y-2">
          <Button className="w-full" size="lg" onClick={confirmOrder} disabled={submitting}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {t.aiIntake.quote.confirming}
              </span>
            ) : (
              t.aiIntake.quote.confirm
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t.aiIntake.quote.disclaimer}</p>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-2 border-t flex gap-2 items-center">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.aiIntake.placeholder}
            className="flex-1 h-10"
            disabled={busy}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <Button size="icon-sm" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function QuoteCard({ quote }: { quote: Quote }) {
  const lang = useAppStore((s) => s.lang)
  const q = translations[lang].aiIntake.quote

  const lineLabel: Record<Quote['lines'][number]['key'], string> = {
    removal: q.lineRemoval,
    disposal: q.lineDisposal(quote.litres),
    driving: q.lineDriving,
    labour: q.lineLabour(quote.labourHours, quote.hourlyRate),
  }

  return (
    <Card className="ml-9">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{q.title}</p>
          <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
            <Clock className="size-3.5" />
            {q.arrival(quote.eta)}
          </span>
        </div>

        <div className="space-y-1.5">
          {quote.lines.map((line) => (
            <div key={line.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {lineLabel[line.key]}
                {line.key === 'labour' && (
                  <span className="ml-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                    {q.rateNotes[quote.rateNote]}
                  </span>
                )}
              </span>
              <span className="font-medium tabular-nums whitespace-nowrap">€{line.amount}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t pt-2.5">
          <span className="text-sm font-semibold">{q.total}</span>
          <span className="font-heading text-2xl font-bold tabular-nums">€{quote.total}</span>
        </div>
      </CardContent>
    </Card>
  )
}
