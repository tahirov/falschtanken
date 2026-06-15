import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Fuel, AlertTriangle, Droplets, HelpCircle,
  X, CheckCircle2, MoreHorizontal, Car,
  MapPin, Mic, Send,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { mockAnswers } from '@/lib/mockData'

type StepKey = 'situation' | 'engineStarted' | 'litres' | 'location' | 'vehicle'

const STEPS: StepKey[] = ['situation', 'engineStarted', 'litres', 'location', 'vehicle']
const TOTAL = STEPS.length

const chipIcons: Record<string, React.ElementType> = {
  'Benzin in Diesel': Fuel,
  'Diesel in Benzin': AlertTriangle,
  'AdBlue falsch': Droplets,
  'Anderer Kraftstoff': HelpCircle,
  'Petrol in Diesel': Fuel,
  'Diesel in Petrol': AlertTriangle,
  'Wrong AdBlue': Droplets,
  'Other fuel': HelpCircle,
  'Benzyna do diesla': Fuel,
  'Diesel do benzyny': AlertTriangle,
  'Błędne AdBlue': Droplets,
  'Inny rodzaj': HelpCircle,
  'Nein, gar nicht': X,
  'Kurz angelassen': MoreHorizontal,
  'Ja, gefahren': AlertTriangle,
  'Bin nicht sicher': HelpCircle,
  'No, not at all': X,
  'Started briefly': MoreHorizontal,
  'Yes, drove it': AlertTriangle,
  'Not sure': HelpCircle,
  'Nie, wcale': X,
  'Krótko uruchomiony': MoreHorizontal,
  'Tak, jechałem': AlertTriangle,
  'Nie jestem pewny': HelpCircle,
  default: CheckCircle2,
}

function getChipIcon(label: string): React.ElementType {
  return chipIcons[label] ?? chipIcons.default
}

interface ChatBubble {
  role: 'assistant' | 'user'
  text: string
}

export function IntakeScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang]
  const store = useAppStore()

  const [currentStep, setCurrentStep] = useState(store.currentStep)
  const [textInput, setTextInput] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationValue, setLocationValue] = useState(store.location)
  const [history, setHistory] = useState<ChatBubble[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const stepKeys = STEPS
  const activeKey = stepKeys[currentStep]

  // GPS detection on mount
  useEffect(() => {
    if (store.location) return
    setLocationLoading(true)
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        setLocationValue(loc)
        setLocationLoading(false)
      },
      () => {
        setLocationLoading(false)
      },
      { timeout: 5000 }
    )
  }, [])

  // Push initial assistant question
  useEffect(() => {
    setHistory([{ role: 'assistant', text: t.intake.questions[activeKey] }])
  }, [])

  // Scroll to bottom when history changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  function advance(answer: string) {
    // Store the answer
    const setters: Record<StepKey, (v: string) => void> = {
      situation: store.setSituation,
      engineStarted: store.setEngineStarted,
      litres: store.setLitres,
      location: store.setLocation,
      vehicle: store.setVehicle,
    }
    setters[activeKey](answer)

    const next = currentStep + 1

    // Append user bubble + next assistant question
    const newHistory: ChatBubble[] = [
      ...history,
      { role: 'user', text: answer },
    ]

    if (next < TOTAL) {
      const nextKey = stepKeys[next]
      newHistory.push({ role: 'assistant', text: t.intake.questions[nextKey] })
      setHistory(newHistory)
      setCurrentStep(next)
      setTextInput('')
    } else {
      setHistory([...newHistory, { role: 'assistant', text: '✓ Alle Informationen gesammelt.' }])
      store.setAllComplete(true)
      store.setCurrentStep(0)
      setTimeout(() => navigate('/offer'), 600)
    }
  }

  function handleChipClick(chip: string) {
    if (activeKey === 'location' && chip === t.intake.chips.location[0] && locationValue) {
      advance(locationValue)
    } else {
      advance(chip)
    }
  }

  function handleTextSubmit() {
    if (!textInput.trim()) return
    advance(textInput.trim())
  }

  function handleMic() {
    const mock = mockAnswers[activeKey] ?? 'Beispielantwort'
    setTextInput(mock)
    setTimeout(() => advance(mock), 300)
  }

  const progress = Math.round(((currentStep) / TOTAL) * 100)
  const chips = t.intake.chips[activeKey] as readonly string[]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Progress bar */}
      <div className="px-4 pt-4 pb-3 border-b">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            {t.intake.stepLabel(currentStep + 1, TOTAL)}
          </span>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {history.map((bubble, i) => (
          <div
            key={i}
            className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {bubble.role === 'assistant' && (
              <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Car className="size-3.5 text-primary-foreground" />
              </div>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-snug ${
                bubble.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}
            >
              {bubble.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Answer chips */}
      <div className="px-4 pb-2 space-y-2">
        {activeKey === 'location' && locationLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <MapPin className="size-4 animate-pulse" />
            {t.intake.locationDetecting}
          </div>
        ) : activeKey === 'location' && locationValue ? (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => advance(locationValue)}
          >
            <MapPin className="size-4 text-primary shrink-0" />
            <span className="truncate text-sm">{locationValue}</span>
            <CheckCircle2 className="size-4 text-primary ml-auto shrink-0" />
          </Button>
        ) : null}

        {activeKey !== 'location' || !locationValue
          ? chips.slice(0, 4).map((chip) => {
              const Icon = getChipIcon(chip)
              return (
                <Button
                  key={chip}
                  variant="outline"
                  className="w-full justify-start gap-3"
                  onClick={() => handleChipClick(chip)}
                >
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{chip}</span>
                </Button>
              )
            })
          : activeKey === 'location' && locationValue
          ? null
          : null}

        {activeKey === 'location' && !locationValue && (
          chips.map((chip) => (
            <Button
              key={chip}
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => handleChipClick(chip)}
            >
              <MapPin className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{chip}</span>
            </Button>
          ))
        )}
      </div>

      {/* Text input bar */}
      <div className="px-4 pb-4 pt-2 border-t flex gap-2 items-center">
        <Input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={t.intake.typeAnswer}
          className="flex-1 h-10"
          onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
        />
        <Button size="icon-sm" variant="ghost" onClick={handleMic} aria-label="Mikrofon">
          <Mic className="size-4" />
        </Button>
        <Button size="icon-sm" onClick={handleTextSubmit} aria-label="Senden">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
