import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Car, Send, Clock, Loader2, Mic, Square, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import { translations, type Lang } from '@/lib/i18n'
import { loadChat, saveChat, clearChat } from '@/lib/chatSession'
import { saveDispatch } from '@/lib/dispatchSession'
import {
  runIntakeAgent,
  runIntakeAgentVoice,
  type AgentMessage,
  type AgentFields,
  type AgentResult,
} from '@/lib/intakeAgent'
import { calculateQuote, type Quote } from '@/lib/pricingLogic'
import { submitOrder } from '@/lib/orders'
import { WavRecorder } from '@/lib/audioRecorder'
import { reverseGeocode } from '@/lib/geocode'

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
  const [recording, setRecording] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [askingLocation, setAskingLocation] = useState(false)
  const [locating, setLocating] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const seeded = useRef(false)
  const recorderRef = useRef<WavRecorder | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, quote])

  // If the customer entered via a situation card, kick off the conversation
  // with that fuel situation so the assistant acknowledges it and moves on.
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    // Restore a persisted conversation (e.g. after a refresh) before seeding.
    const snap = loadChat()
    if (snap) {
      store.setLang(snap.lang as Lang)
      store.setSituation(snap.fields.situation)
      store.setEngineStarted(snap.fields.engineStarted)
      store.setLitres(snap.fields.litres)
      store.setLocation(snap.fields.location)
      store.setVehicle(snap.fields.vehicle)
      store.setContactName(snap.fields.contactName)
      store.setContactPhone(snap.fields.contactPhone)
      store.setEta(snap.eta)
      store.setPrice(snap.price)
      setMessages(snap.messages)
      setSuggestions(snap.suggestions)
      setQuote(snap.quote)
      return
    }
    if (store.seedAudio) {
      const audio = store.seedAudio
      store.setSeedAudio(null)
      runVoiceTurn(audio)
    } else if (store.situation.trim()) {
      runTurn(store.situation.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the conversation so a refresh restores it.
  useEffect(() => {
    if (messages.length === 0) return
    saveChat({
      lang,
      messages,
      suggestions,
      quote,
      eta: store.eta,
      price: store.price,
      fields: {
        situation: store.situation,
        engineStarted: store.engineStarted,
        litres: store.litres,
        location: store.location,
        vehicle: store.vehicle,
        contactName: store.contactName,
        contactPhone: store.contactPhone,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, suggestions, quote, lang])

  function applyFields(f: AgentFields) {
    if (f.situation) store.setSituation(f.situation)
    if (f.engineStarted) store.setEngineStarted(f.engineStarted)
    if (f.litres) store.setLitres(f.litres)
    if (f.location) store.setLocation(f.location)
    if (f.vehicle) store.setVehicle(f.vehicle)
    if (f.contactName) store.setContactName(f.contactName)
    if (f.contactPhone) store.setContactPhone(f.contactPhone)
  }

  // Apply a successful agent result: persist fields, refresh quick-reply
  // chips, and build the in-thread quote once the case is complete.
  function applyAgentResult(result: AgentResult) {
    applyFields(result.fields)
    setSuggestions(result.complete ? [] : result.suggestions)
    setAskingLocation(!result.complete && result.asksLocation)
    if (result.complete) {
      const q = calculateQuote(
        result.fields.engineStarted ?? store.engineStarted,
        result.fields.litres ?? store.litres,
      )
      store.setPrice(q.total)
      store.setEta(q.eta)
      setQuote(q)
    }
  }

  async function runTurn(text: string) {
    const clean = text.trim()
    if (!clean || busy || quote) return
    const next: AgentMessage[] = [...messages, { role: 'user', content: clean }]
    setMessages(next)
    setSuggestions([])
    setAskingLocation(false)
    setBusy(true)
    const { result, error } = await runIntakeAgent(next, lang)
    setBusy(false)
    if (error || !result) {
      setMessages([...next, { role: 'assistant', content: t.aiIntake.error }])
      return
    }
    applyAgentResult(result)
    setMessages([...next, { role: 'assistant', content: result.reply || '…' }])
  }

  // Voice turn: send the audio, then store the returned transcript as the
  // user's text bubble so the rest of the conversation stays text-only.
  async function runVoiceTurn(wavBase64: string) {
    if (busy || quote) return
    const history = messages
    setSuggestions([])
    setAskingLocation(false)
    setBusy(true)
    const { result, error } = await runIntakeAgentVoice(history, wavBase64, lang)
    setBusy(false)
    const userBubble = result?.transcript || `🎤 ${t.aiIntake.voiceNote}`
    if (error || !result) {
      setMessages([
        ...history,
        { role: 'user', content: userBubble },
        { role: 'assistant', content: t.aiIntake.error },
      ])
      return
    }
    applyAgentResult(result)
    setMessages([
      ...history,
      { role: 'user', content: userBubble },
      { role: 'assistant', content: result.reply || '…' },
    ])
  }

  async function toggleRecord() {
    if (busy || quote) return
    if (recording) {
      const rec = recorderRef.current
      recorderRef.current = null
      setRecording(false)
      if (!rec) return
      const wav = await rec.stop()
      runVoiceTurn(wav)
      return
    }
    try {
      const rec = new WavRecorder()
      await rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      toast.error(t.aiIntake.micError)
    }
  }

  function send() {
    if (!input.trim()) return
    const text = input
    setInput('')
    runTurn(text)
  }

  function shareLocation() {
    if (busy || quote || locating) return
    if (!navigator.geolocation) {
      toast.error(t.aiIntake.locationError)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        // Prefer a street address; fall back to coordinates if lookup fails.
        const address = await reverseGeocode(latitude, longitude)
        setLocating(false)
        runTurn(address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
      },
      () => {
        setLocating(false)
        toast.error(t.aiIntake.locationError)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function confirmOrder() {
    if (!quote || submitting) return
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
        severity: quote.severity,
        price: quote.total,
        eta_minutes: quote.eta,
        lang,
      },
      quote,
    )
    store.setOrderId(id)
    if (id) saveDispatch({ orderId: id, price: quote.total, eta: quote.eta })
    clearChat() // case submitted — don't restore/re-submit it later
    navigate('/dispatch')
  }

  // The static greeting leads the thread; the live conversation follows.
  const bubbles: AgentMessage[] = [{ role: 'assistant', content: t.aiIntake.greeting }, ...messages]

  // Chips: the agent's per-question answers, or — at the very start, before
  // anything has been said — the four situation starters to get going.
  const starters =
    messages.length === 0 && !store.situation.trim() && !store.seedAudio
      ? Object.values(t.situations).map((s) => s.title)
      : []
  const chipOptions = suggestions.length > 0 ? suggestions : starters

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
        <div className="border-t">
          {(chipOptions.length > 0 || askingLocation) && !busy && !recording && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {askingLocation && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full font-normal gap-1.5"
                  onClick={shareLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  {locating ? t.aiIntake.locating : t.aiIntake.shareLocation}
                </Button>
              )}
              {chipOptions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="rounded-full font-normal"
                  onClick={() => runTurn(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
          <div className="px-4 pb-4 pt-2 flex gap-2 items-center">
          {recording ? (
            <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-md bg-muted">
              <span className="size-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-sm text-muted-foreground">{t.aiIntake.listening}</span>
            </div>
          ) : (
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.aiIntake.placeholder}
              className="flex-1 h-10"
              disabled={busy}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
          )}
          <Button
            size="icon-sm"
            variant={recording ? 'destructive' : 'ghost'}
            onClick={toggleRecord}
            disabled={busy}
            aria-label={recording ? 'Stop recording' : 'Record voice message'}
          >
            {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button
            size="icon-sm"
            onClick={send}
            disabled={busy || recording || !input.trim()}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
          </div>
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
