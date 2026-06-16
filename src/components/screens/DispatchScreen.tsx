import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Phone, Send, Star, Loader2, CheckCheck,
  ChevronRight, X, Fuel, Zap, MapPin, Car, User, ExternalLink,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { technician } from '@/lib/mockData'
import { getOrderStatus, sendDispatchMessage } from '@/lib/orders'
import { loadDispatch, saveDispatch, clearDispatch } from '@/lib/dispatchSession'

interface Message {
  id: number
  from: 'tech' | 'user' | 'system'
  text: string
}

type Phase = 'pending' | 'notifying' | 'connected' | 'declined'

export function DispatchScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]
  const store = useAppStore()

  // Restore the dispatch on refresh: in-memory store wins, else the persisted
  // session so we resume real order tracking instead of the demo sequence.
  const persisted = useRef(loadDispatch()).current
  const orderId = store.orderId ?? persisted?.orderId ?? null
  const eta = store.eta || persisted?.eta || 35
  const price = store.price || persisted?.price || 150

  // If we'd already connected before a refresh, show the connected screen
  // straight away (no "notifying" flash); the poll below still re-verifies.
  const [phase, setPhase] = useState<Phase>(persisted?.arrivalAt ? 'connected' : 'pending')
  const [arrivalAt, setArrivalAt] = useState<number | null>(persisted?.arrivalAt ?? null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [inputText, setInputText] = useState('')
  // Restore the technician conversation after a refresh.
  const [messages, setMessages] = useState<Message[]>(() => persisted?.messages ?? [])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const msgIdRef = useRef(
    persisted?.messages?.length ? Math.max(...persisted.messages.map((m) => m.id)) : 0,
  )
  // A resume = we'd already connected before the refresh (deadline persisted).
  const resumed = useRef(!!persisted?.arrivalAt).current

  function playAcceptedChime() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const now = ctx.currentTime
      ;[[880, 0], [1320, 0.18]].forEach(([freq, offset]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        osc.connect(gain)
        gain.connect(ctx.destination)
        const start = now + offset
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
        osc.start(start)
        osc.stop(start + 0.4)
      })
    } catch { /* audio is best-effort */ }
    try { (navigator as Navigator & { vibrate?: (p: number[]) => void }).vibrate?.([120, 60, 120]) } catch { /* ignore */ }
  }

  function connect() {
    setPhase('connected')
    // Fix the arrival deadline once (persisted) so the countdown keeps ticking
    // down across refreshes instead of restarting.
    const at = persisted?.arrivalAt ?? arrivalAt ?? Date.now() + Math.max(1, eta) * 60000
    setArrivalAt(at)
    setNowTs(Date.now())
    // On a fresh accept: chime + seed the accepted message. On a refresh-resume,
    // keep the restored conversation and stay quiet.
    if (!resumed) {
      playAcceptedChime()
      if (messages.length === 0) {
        msgIdRef.current += 1
        setMessages([{
          id: msgIdRef.current,
          from: 'tech',
          text: t.dispatch.acceptedMessage(technician.name, eta),
        }])
      }
    }
  }

  // Keep the persisted dispatch snapshot in sync (incl. the conversation) so a
  // refresh restores the technician screen and messages exactly. Guard on the
  // LIVE store.orderId (not the persisted fallback) so cancelling, which clears
  // it, doesn't immediately re-save and resurrect the dispatch.
  useEffect(() => {
    if (!store.orderId) return
    saveDispatch({ orderId: store.orderId, price, eta, arrivalAt: arrivalAt ?? undefined, messages })
  }, [store.orderId, price, eta, arrivalAt, messages])

  // Phase transitions. We ONLY move to "connected" when the operator actually
  // accepts the job in Telegram (polled below) — never on a timer. Faking an
  // acceptance would also mean the customer's chat messages go nowhere.
  useEffect(() => {
    const toNotifying = setTimeout(() => setPhase('notifying'), 1200)
    // Without a tracked order id we cannot poll; stay in "notifying" rather than
    // fabricate an acceptance.
    if (!orderId) return () => clearTimeout(toNotifying)
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const status = await getOrderStatus(orderId)
      if (!active) return
      if (status === 'dispatched' || status === 'completed') return connect()
      if (status === 'cancelled') return setPhase('declined')
      timer = setTimeout(poll, 3000)
    }
    poll()
    return () => { active = false; clearTimeout(toNotifying); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, eta])

  // Cycle the notifying status line so the wait feels alive.
  const [notifyStep, setNotifyStep] = useState(0)
  useEffect(() => {
    if (phase !== 'notifying') return
    const steps = t.dispatch.notifyingSteps
    const iv = setInterval(() => setNotifyStep((s) => (s + 1) % steps.length), 1600)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Re-read the clock each second; remaining time is derived from the fixed
  // arrival deadline, so it keeps counting down correctly after a refresh.
  useEffect(() => {
    if (phase !== 'connected') return
    const iv = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [phase])

  const remainingSec = arrivalAt
    ? Math.max(0, Math.round((arrivalAt - nowTs) / 1000))
    : Math.max(1, eta) * 60
  const countdown = `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, '0')}`

  async function sendMessage() {
    const text = inputText.trim()
    if (!text) return
    msgIdRef.current += 1
    const userMsg: Message = { id: msgIdRef.current, from: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setInputText('')

    // Forward to Ihsan's Telegram (one-way), then reassure: delivered → seen.
    if (orderId) await sendDispatchMessage(orderId, text)
    msgIdRef.current += 1
    const noteId = msgIdRef.current
    setMessages((prev) => [...prev, { id: noteId, from: 'system', text: t.dispatch.delivered }])
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === noteId ? { ...m, text: t.dispatch.seen } : m)),
      )
    }, 1400)
  }

  function handleCancel() {
    clearDispatch()
    store.resetCase()
    setCancelOpen(false)
    navigate('/')
  }

  // Declined phase — operator could not take the job.
  if (phase === 'declined') {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-6 px-6 text-center">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center">
          <XCircle className="size-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <p className="font-heading font-semibold text-base">{t.dispatch.declinedTitle}</p>
          <p className="text-sm text-muted-foreground max-w-xs">{t.dispatch.declinedText}</p>
        </div>
        <Button onClick={() => { clearDispatch(); store.resetCase(); navigate('/') }}>
          {t.dispatch.declinedCta}
        </Button>
      </div>
    )
  }

  // Pending/notifying phase
  if (phase !== 'connected') {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-6 px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center">
            <Loader2 className="size-8 text-primary animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="font-heading font-semibold text-base">
              {phase === 'pending' ? t.dispatch.transmitting : t.dispatch.notifying}
            </p>
            {phase === 'notifying' && (
              <p className="text-sm shimmer-text font-medium">
                {t.dispatch.notifyingSteps[notifyStep]}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      {/* Confirmed banner = the order summary; tap it to view full details */}
      <div className="px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left transition hover:bg-green-100/50"
        >
          <CheckCircle2 className="size-5 text-green-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-green-900">
              {t.dispatch.accepted(technician.name)}
            </p>
            <p className="text-xs text-green-700 mt-0.5 tabular-nums">
              €{price} · {t.dispatch.arrivalIn} {countdown}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-green-700">
            {t.dispatch.detailsShort}
            <ChevronRight className="size-4" />
          </span>
        </button>
      </div>

      {/* Technician card */}
      <div className="px-4 pb-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <img
              src={technician.photo}
              alt={technician.name}
              className="size-12 rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{technician.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.dispatch.technicianRole}</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-0.5">
                  <Star className="size-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">{technician.rating}</span>
                </div>
                <span className="text-xs text-muted-foreground">{technician.jobCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 py-2">
        {messages.map((msg) =>
          msg.from === 'system' ? (
            <div key={msg.id} className="flex justify-center px-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCheck className="size-3.5 text-green-600" />
                {msg.text}
              </span>
            </div>
          ) : (
            <div
              key={msg.id}
              className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.from === 'tech' && (
                <img
                  src={technician.photo}
                  alt={technician.name}
                  className="size-7 rounded-full object-cover shrink-0 mr-2 mt-0.5"
                />
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.from === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ),
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Chat note */}
      <p className="text-center text-xs text-muted-foreground px-6 py-2">{t.dispatch.chatNote}</p>

      {/* Action row */}
      <div className="flex gap-2 px-4 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => {
            window.location.href = `tel:${technician.phone.replace(/[^\d+]/g, '')}`
          }}
        >
          <Phone className="size-4" />
          {t.dispatch.callButton}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 text-destructive hover:text-destructive"
          onClick={() => setCancelOpen(true)}
        >
          {t.dispatch.cancelButton}
        </Button>

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t.dispatch.cancelTitle}</DialogTitle>
              <DialogDescription>{t.dispatch.cancelDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                {t.dispatch.cancelAbort}
              </Button>
              <Button variant="destructive" onClick={handleCancel}>
                {t.dispatch.cancelConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Message input */}
      <div className="flex gap-2 px-4 pb-4 pt-1 border-t">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t.dispatch.inputPlaceholder}
          className="flex-1 h-10"
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <Button size="icon" onClick={sendMessage} aria-label="Senden">
          <Send className="size-4" />
        </Button>
      </div>

      {/* Order-details bottom drawer (anchored to the card content). */}
      {showDetails && (
        <>
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setShowDetails(false)}
            className="absolute inset-0 z-40 bg-black/25 drawer-fade"
          />
          <div className="absolute inset-x-0 bottom-0 z-50 max-h-[85%] overflow-y-auto rounded-t-2xl border-t bg-background p-4 shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.25)] drawer-up">
            <div className="flex items-center justify-between">
              <p className="font-heading text-base font-medium">{t.dispatch.orderDetails}</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowDetails(false)} aria-label="Schließen">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-3 space-y-2.5 pb-2 text-sm">
              {([
                { icon: Fuel, label: t.offer.labels.situation, value: store.situation },
                { icon: Zap, label: t.offer.labels.engineStarted, value: store.engineStarted },
                { icon: Fuel, label: t.offer.labels.litres, value: store.litres },
                { icon: Car, label: t.offer.labels.vehicle, value: store.vehicle },
                { icon: MapPin, label: t.offer.labels.location, value: store.location },
                { icon: User, label: t.offer.contactName, value: store.contactName },
                { icon: Phone, label: t.offer.contactPhone, value: store.contactPhone },
              ] as { icon: React.ElementType; label: string; value: string }[]).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </span>
                  <span className="text-right font-medium">{value || '—'}</span>
                </div>
              ))}
              {store.vehicleDocUrl && (
                <a
                  href={store.vehicleDocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 pt-1 text-primary hover:underline"
                >
                  <ExternalLink className="size-4" />
                  {t.dispatch.viewDoc}
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
