import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Car, Send, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { runIntakeAgent, type AgentMessage, type AgentFields } from '@/lib/intakeAgent'

export function AiIntakeScreen() {
  const navigate = useNavigate()
  const store = useAppStore()
  const lang = store.lang
  const t = translations[lang]

  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

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
    if (!text || busy || done) return
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
      setDone(true)
      store.setAllComplete(true)
      setTimeout(() => navigate('/offer'), 900)
    }
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
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t.aiIntake.analyzing}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t flex gap-2 items-center">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.aiIntake.placeholder}
          className="flex-1 h-10"
          disabled={busy || done}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button
          size="icon-sm"
          onClick={send}
          disabled={busy || done || !input.trim()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
