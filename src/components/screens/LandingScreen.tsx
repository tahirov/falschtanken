import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mic, ArrowUp, X, Check } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { WavRecorder } from '@/lib/audioRecorder'

const MAX_REC_SECONDS = 60
const BAR_COUNT = 56

const situationKeys = [
  'benzinInDiesel',
  'dieselInBenzin',
  'adblueFalsch',
  'andererKraftstoff',
] as const

export function LandingScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const setSituation = useAppStore((s) => s.setSituation)
  const setOrderId = useAppStore((s) => s.setOrderId)
  const setSeedAudio = useAppStore((s) => s.setSeedAudio)
  const t = translations[lang]

  const [recording, setRecording] = useState(false)
  const [recSec, setRecSec] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0))
  const recorderRef = useRef<WavRecorder | null>(null)

  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  const [cursorOn, setCursorOn] = useState(true)
  const placeholders = t.promptPlaceholders
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Picking a suggestion fills the box (doesn't auto-submit) so the user can
  // tweak it or just press Enter / the arrow to start.
  function fillFromPill(value: string) {
    setText(value)
    const el = inputRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(value.length, value.length)
    }
  }

  // Typewriter placeholder: type a phrase in, hold, delete it, move to the next.
  useEffect(() => {
    let phrase = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const full = placeholders[phrase]
      if (!deleting) {
        char++
        setTyped(full.slice(0, char))
        if (char >= full.length) {
          deleting = true
          timer = setTimeout(tick, 1500) // hold the finished phrase
          return
        }
        timer = setTimeout(tick, 55)
      } else {
        char--
        setTyped(full.slice(0, char))
        if (char <= 0) {
          deleting = false
          phrase = (phrase + 1) % placeholders.length
          timer = setTimeout(tick, 350)
          return
        }
        timer = setTimeout(tick, 28)
      }
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [placeholders])

  // Blinking caret appended to the typed placeholder.
  useEffect(() => {
    const id = setInterval(() => setCursorOn((c) => !c), 530)
    return () => clearInterval(id)
  }, [])

  // Every entry point leads into the same conversational AI intake; we just
  // pre-seed it with whatever the customer typed or the situation they picked.
  function start(seed: string) {
    setOrderId(null)
    setSituation(seed)
    navigate('/chat')
  }

  async function startRecording() {
    if (recording) return
    try {
      const rec = new WavRecorder()
      await rec.start()
      recorderRef.current = rec
      setRecSec(0)
      setRecording(true)
    } catch {
      toast.error(t.aiIntake.micError)
    }
  }

  function cancelRecording() {
    recorderRef.current?.cancel()
    recorderRef.current = null
    setRecording(false)
    setRecSec(0)
  }

  async function confirmRecording() {
    const rec = recorderRef.current
    if (!rec) return
    recorderRef.current = null
    setRecording(false)
    const wav = await rec.stop()
    setOrderId(null)
    setSituation('')
    setSeedAudio(wav)
    navigate('/chat')
  }

  // Recording timer; auto-finish at the max length.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecSec((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  // Live waveform: sample the real mic level each frame and scroll it in.
  useEffect(() => {
    if (!recording) {
      setLevels(Array(BAR_COUNT).fill(0))
      return
    }
    const history = Array(BAR_COUNT).fill(0)
    let raf = 0
    const loop = () => {
      history.push(recorderRef.current?.level() ?? 0)
      history.shift()
      setLevels(history.slice())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [recording])
  useEffect(() => {
    if (recording && recSec >= MAX_REC_SECONDS) confirmRecording()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSec, recording])

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Hero */}
      <div className="px-6 pt-16 pb-8 text-center">
        <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight text-balance">
          {t.heroTitle}
        </h1>
        <p className="text-muted-foreground text-base mt-4 max-w-xs mx-auto text-balance">
          {t.heroSubtitle}
        </p>
      </div>

      {/* Prompt box */}
      <div className="px-5">
        <div className="rounded-2xl border bg-card shadow-sm p-2 focus-within:ring-2 focus-within:ring-primary/40 transition">
          {recording ? (
            <div className="flex items-center gap-2 px-3 min-h-[72px]">
              <span className="size-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <div className="flex-1 flex items-center justify-end gap-[2px] h-8 overflow-hidden">
                {levels.map((lvl, i) => (
                  <span
                    key={i}
                    className="w-[2px] rounded-full bg-primary/70 transition-[height] duration-75 ease-out shrink-0"
                    style={{ height: `${Math.max(2, Math.min(28, 2 + lvl * 140))}px` }}
                  />
                ))}
              </div>
              <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                {Math.floor(recSec / 60)}:{String(recSec % 60).padStart(2, '0')}
              </span>
            </div>
          ) : (
            <Textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`${typed}${cursorOn ? '▍' : ' '}`}
            rows={3}
            className="border-0 shadow-none focus-visible:ring-0 resize-none px-3 py-2.5 text-base min-h-[72px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                start(text.trim())
              }
            }}
          />
          )}
          <div className="flex items-center justify-end gap-2 px-1 pb-1">
            {recording ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={cancelRecording}
                  aria-label="Cancel recording"
                  className="rounded-full"
                >
                  <X className="size-5" />
                </Button>
                <Button
                  size="icon"
                  onClick={confirmRecording}
                  aria-label="Send voice message"
                  className="rounded-full"
                >
                  <Check className="size-5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startRecording}
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
              </>
            )}
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
              onClick={() => fillFromPill(t.situations[key].title)}
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
