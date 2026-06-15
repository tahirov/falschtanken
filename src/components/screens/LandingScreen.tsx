import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, Fuel, AlertTriangle, Droplets, HelpCircle, Globe } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations, type Lang } from '@/lib/i18n'

const situationKeys = [
  'benzinInDiesel',
  'dieselInBenzin',
  'adblueFalsch',
  'andererKraftstoff',
] as const

const situationIcons = {
  benzinInDiesel: Fuel,
  dieselInBenzin: AlertTriangle,
  adblueFalsch: Droplets,
  andererKraftstoff: HelpCircle,
}

const LANGS: Lang[] = ['de', 'en', 'pl']

export function LandingScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const setSituation = useAppStore((s) => s.setSituation)
  const setOrderId = useAppStore((s) => s.setOrderId)
  const t = translations[lang]

  // Both entry points lead into the same conversational AI intake. Picking a
  // card just pre-seeds the fuel situation so the assistant doesn't re-ask it.
  function startChat(situation: string) {
    setOrderId(null)
    setSituation(situation)
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
      <div className="flex flex-col items-center text-center px-6 pt-8 pb-6 gap-3">
        <div className="size-14 rounded-full bg-primary flex items-center justify-center mb-1">
          <Fuel className="size-7 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold leading-tight">{t.appName}</h1>
        <p className="text-muted-foreground text-sm">{t.tagline}</p>
      </div>

      {/* Voice button */}
      <div className="flex flex-col items-center gap-4 px-6 pb-6">
        <div className="relative flex items-center justify-center">
          {/* Pulsing ring */}
          <span className="absolute inline-flex size-20 rounded-full bg-primary opacity-20 animate-ping" />
          <Button
            size="lg"
            onClick={() => startChat('')}
            className="relative size-20 rounded-full shadow-lg"
            aria-label={t.speakButton}
          >
            <Mic className="size-8" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground font-medium">{t.speakButton}</p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 px-6 pb-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">{t.orChoose}</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Situation cards */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-6">
        {situationKeys.map((key) => {
          const Icon = situationIcons[key]
          const situation = t.situations[key]
          return (
            <Card
              key={key}
              className="cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all active:scale-[0.98]"
              onClick={() => startChat(situation.title)}
            >
              <CardContent className="flex flex-col gap-2 pt-4 pb-4">
                <Icon className="size-6 text-primary" />
                <div>
                  <p className="font-heading font-semibold text-sm leading-tight">{situation.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{situation.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Availability banner */}
      <div className="mt-auto mx-6 mb-6 rounded-xl bg-muted px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">{t.availability}</p>
      </div>
    </div>
  )
}
