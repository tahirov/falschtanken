import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Fuel, Globe, Mic, ArrowUp } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations, type Lang } from '@/lib/i18n'

const situationKeys = [
  'benzinInDiesel',
  'dieselInBenzin',
  'adblueFalsch',
  'andererKraftstoff',
] as const

const LANGS: Lang[] = ['de', 'en', 'pl']

export function LandingScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const setSituation = useAppStore((s) => s.setSituation)
  const setOrderId = useAppStore((s) => s.setOrderId)
  const t = translations[lang]

  const [text, setText] = useState('')
  const [phIndex, setPhIndex] = useState(0)
  const placeholders = t.promptPlaceholders

  // Cycle the example placeholder while the box is empty.
  const emptyRef = useRef(true)
  emptyRef.current = text.trim() === ''
  useEffect(() => {
    const id = setInterval(() => {
      if (emptyRef.current) setPhIndex((i) => (i + 1) % placeholders.length)
    }, 3200)
    return () => clearInterval(id)
  }, [placeholders.length])

  // Every entry point leads into the same conversational AI intake; we just
  // pre-seed it with whatever the customer typed or the situation they picked.
  function start(seed: string) {
    setOrderId(null)
    setSituation(seed)
    navigate('/chat')
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Language switcher */}
      <div className="flex justify-end px-4 pt-3 gap-1">
        {LANGS.map((l) => (
          <Button
            key={l}
            variant={lang === l ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setLang(l)}
            className="uppercase font-bold text-xs"
          >
            {l}
          </Button>
        ))}
        <Globe className="size-4 text-muted-foreground self-center ml-1" />
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center text-center px-6 pt-10 pb-7 gap-3">
        <div className="size-14 rounded-full bg-primary flex items-center justify-center mb-1">
          <Fuel className="size-7 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold leading-tight">{t.appName}</h1>
        <p className="text-muted-foreground text-sm">{t.tagline}</p>
      </div>

      {/* Prompt box */}
      <div className="px-5">
        <div className="rounded-2xl border bg-card shadow-sm p-3 focus-within:ring-2 focus-within:ring-primary/40 transition">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholders[phIndex]}
            rows={3}
            className="border-0 shadow-none focus-visible:ring-0 resize-none p-0 text-base min-h-[64px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                start(text.trim())
              }
            }}
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => start('')}
              aria-label={t.speakButton}
              className="rounded-full text-muted-foreground"
            >
              <Mic className="size-5" />
            </Button>
            <Button
              size="icon"
              onClick={() => start(text.trim())}
              aria-label="Start"
              className="rounded-full"
            >
              <ArrowUp className="size-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Suggestion pills */}
      <div className="px-6 pt-6">
        <p className="text-center text-xs text-muted-foreground mb-3">{t.tryThese}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {situationKeys.map((key) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => start(t.situations[key].title)}
              className="rounded-full font-normal"
            >
              {t.situations[key].title}
            </Button>
          ))}
        </div>
      </div>

      {/* Availability banner */}
      <div className="mt-auto mx-6 mb-6 rounded-xl bg-muted px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">{t.availability}</p>
      </div>
    </div>
  )
}
