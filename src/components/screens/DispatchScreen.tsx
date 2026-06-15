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
import { CheckCircle2, XCircle, Phone, Send, Star, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { technician, mockReplies } from '@/lib/mockData'
import { getOrderStatus } from '@/lib/orders'

interface Message {
  id: number
  from: 'tech' | 'user'
  text: string
}

type Phase = 'pending' | 'notifying' | 'connected' | 'declined'

export function DispatchScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]
  const store = useAppStore()
  const eta = store.eta || 35
  const price = store.price || 150

  const [phase, setPhase] = useState<Phase>('pending')
  const [remainingSec, setRemainingSec] = useState(0)
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [cancelOpen, setCancelOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const msgIdRef = useRef(0)

  const orderId = store.orderId

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
    setRemainingSec(Math.max(1, eta) * 60)
    playAcceptedChime()
    msgIdRef.current += 1
    setMessages([{
      id: msgIdRef.current,
      from: 'tech',
      text: t.dispatch.acceptedMessage(technician.name, eta),
    }])
  }

  // Phase transitions
  useEffect(() => {
    // Manual/offer flow without a tracked order: keep the timed demo sequence.
    if (!orderId) {
      const t1 = setTimeout(() => setPhase('notifying'), 1500)
      const t2 = setTimeout(() => connect(), 4000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    // AI flow: poll until the operator accepts/declines the job in Telegram.
    setPhase('notifying')
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
    return () => { active = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, eta])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Tick the arrival countdown down once the technician is connected.
  useEffect(() => {
    if (phase !== 'connected') return
    const iv = setInterval(() => setRemainingSec((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(iv)
  }, [phase])

  const countdown = `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, '0')}`

  function sendMessage() {
    if (!inputText.trim()) return
    msgIdRef.current += 1
    const userMsg: Message = { id: msgIdRef.current, from: 'user', text: inputText.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInputText('')
    setTimeout(() => {
      const reply = mockReplies[Math.floor(Math.random() * mockReplies.length)]
      msgIdRef.current += 1
      setMessages((prev) => [...prev, { id: msgIdRef.current, from: 'tech', text: reply }])
    }, 2000)
  }

  function handleCancel() {
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
        <Button onClick={() => { store.resetCase(); navigate('/') }}>
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
              <p className="text-sm text-muted-foreground">
                {orderId ? t.dispatch.waiting : 'via WhatsApp'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Confirmed banner */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-green-900">
              {t.dispatch.accepted(technician.name)}
            </p>
            <p className="text-xs text-green-700 mt-0.5 tabular-nums">
              €{price} · {t.dispatch.arrivalIn} {countdown}
            </p>
          </div>
        </div>
      </div>

      {/* Technician card */}
      <div className="px-4 pb-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="size-12 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">{technician.initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{technician.name}</span>
                <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                  <span className="size-1.5 rounded-full bg-green-500 shrink-0" />
                  {t.dispatch.whatsapp}
                </span>
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
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.from === 'tech' && (
              <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <span className="text-primary-foreground text-[10px] font-bold">{technician.initials}</span>
              </div>
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
        ))}
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
          onClick={() => toast.info(t.dispatch.callToast)}
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
    </div>
  )
}
