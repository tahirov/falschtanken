import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Car, MapPin, Send, Camera, Upload, Loader2, CheckCircle2, User, Phone,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { reverseGeocode } from '@/lib/geocode'
import { scanVehicleDoc } from '@/lib/vehicleDoc'
import { IntakeTabs } from '@/components/IntakeTabs'

// Each step writes its answer somewhere in the case. `kind` drives the UI.
type Kind = 'chips' | 'vehicle' | 'location' | 'contact'
interface Step {
  key: string
  kind: Kind
  question: string
  chips?: string[]
}

interface ChatBubble {
  role: 'assistant' | 'user'
  text: string
}

// Heuristic check of a typed vehicle string: a 4-digit year = Baujahr; the first
// non-year token = Marke, a second = Modell. Returns which parts look missing.
function missingVehicleParts(text: string): ('marke' | 'modell' | 'baujahr')[] {
  const hasYear = /\b(19|20)\d{2}\b/.test(text)
  const tokens = text
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[,/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const missing: ('marke' | 'modell' | 'baujahr')[] = []
  if (tokens.length < 1) missing.push('marke')
  if (tokens.length < 2) missing.push('modell')
  if (!hasYear) missing.push('baujahr')
  return missing
}

export function IntakeScreen() {
  const navigate = useNavigate()
  const store = useAppStore()
  const lang = store.lang
  const t = translations[lang]
  const tk = t.intake

  // Build the step queue. km is inserted after the engine step only if they drove.
  function baseSteps(): Step[] {
    return [
      { key: 'situation', kind: 'chips', question: tk.questions.situation, chips: [...tk.chips.situation] },
      { key: 'engineStarted', kind: 'chips', question: tk.questions.engineStarted, chips: [...tk.chips.engineStarted] },
      { key: 'litresAmount', kind: 'chips', question: tk.questions.litres, chips: [...tk.chips.litres] },
      { key: 'tankLevel', kind: 'chips', question: tk.tankLevelQuestion, chips: [...tk.tankLevelChips] },
      { key: 'vehicle', kind: 'vehicle', question: tk.vehicleQuestion },
      { key: 'contact', kind: 'contact', question: tk.contactQuestion },
      // Location is intentionally LAST: confirming it transitions to the order.
      { key: 'location', kind: 'location', question: tk.questions.location },
    ]
  }

  // Asked after the vehicle step only when the customer typed it (a scanned
  // Fahrzeugschein already carries the fuel type).
  function fuelStep(): Step {
    return { key: 'fuel', kind: 'chips', question: tk.fuelQuestion, chips: [...tk.fuelChips] }
  }

  const [queue, setQueue] = useState<Step[]>(() => baseSteps())
  const [stepIndex, setStepIndex] = useState(0)
  const [history, setHistory] = useState<ChatBubble[]>([])
  const [textInput, setTextInput] = useState('')
  const [vehicleText, setVehicleText] = useState('')
  const [locating, setLocating] = useState(false)
  const [detectedLocation, setDetectedLocation] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [scanStep, setScanStep] = useState(0)
  // Holds the litres amount until the tank-level follow-up combines them.
  const litresAmountRef = useRef('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const step = queue[stepIndex]

  // Reset any prior case and open with the first question.
  useEffect(() => {
    store.resetCase()
    setHistory([{ role: 'assistant', text: baseSteps()[0].question }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, scanning])

  // While the scan runs (it takes a few seconds), cycle through step labels so
  // the customer sees progress. Advance and hold on the last step until done.
  useEffect(() => {
    if (!scanning) return
    setScanStep(0)
    const steps = tk.photo.steps
    const id = setInterval(() => setScanStep((s) => Math.min(s + 1, steps.length - 1)), 1300)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  // Persist an answer to the store, folding sub-answers into the existing fields.
  function record(key: string, answer: string) {
    switch (key) {
      case 'situation':
        store.setSituation(answer)
        break
      case 'engineStarted':
        store.setEngineStarted(answer)
        break
      case 'km':
        store.setEngineStarted(`${store.engineStarted}, ${answer}`)
        break
      case 'litresAmount':
        litresAmountRef.current = answer
        break
      case 'tankLevel':
        store.setLitres(`${litresAmountRef.current}, Tank ${answer}`)
        break
      case 'vehicle':
        store.setVehicle(answer)
        break
      case 'fuel':
        if (answer !== tk.fuelChips[2]) store.setVehicle(`${store.vehicle}, ${answer}`)
        break
      case 'vehicleMore':
        // Append the completing details (model/year) to what was typed.
        store.setVehicle(`${store.vehicle} ${answer}`.trim())
        break
      case 'location':
        store.setLocation(answer)
        break
      // 'contact' inputs write straight to the store, nothing to record here.
    }
  }

  // Move to the next step (or finish), optionally splicing in a follow-up step.
  function advance(answer: string, bubble?: string, insert?: Step) {
    record(step.key, answer)
    const userBubble = bubble ?? answer
    let q = queue
    if (insert) {
      q = [...queue.slice(0, stepIndex + 1), insert, ...queue.slice(stepIndex + 1)]
      setQueue(q)
    }
    const next = stepIndex + 1
    const newHistory: ChatBubble[] = [...history, { role: 'user', text: userBubble }]
    if (next < q.length) {
      newHistory.push({ role: 'assistant', text: q[next].question })
      setHistory(newHistory)
      setStepIndex(next)
      setTextInput('')
      setVehicleText('')
      setScanned(false)
      setDetectedLocation(null)
    } else {
      finish(newHistory)
    }
  }

  function finish(h: ChatBubble[]) {
    // No abrupt "✓" flash — keep the last answer on screen, then move to the
    // order page once everything is collected.
    setHistory(h)
    store.setAllComplete(true)
    store.setCurrentStep(0)
    setTimeout(() => navigate('/offer'), 300)
  }

  function onChip(chip: string) {
    // After the engine step, if they drove, ask how far before moving on.
    if (step.key === 'engineStarted' && chip === tk.chips.engineStarted[2]) {
      advance(chip, chip, { key: 'km', kind: 'chips', question: tk.kmQuestion, chips: [...tk.kmChips] })
      return
    }
    advance(chip)
  }

  function onText() {
    const v = textInput.trim()
    if (!v) return
    // After completing the vehicle details, move on to the fuel question.
    if (step.key === 'vehicleMore') {
      advance(v, undefined, fuelStep())
      return
    }
    advance(v)
  }

  function onVehicleNext() {
    const v = vehicleText.trim()
    if (!v) return
    // If Marke/Modell/Baujahr looks incomplete, ask a follow-up to complete it
    // before the fuel question; otherwise go straight to fuel.
    const missing = missingVehicleParts(v)
    if (missing.length) {
      const parts = missing.map((m) => tk.vehicleParts[m]).join(', ')
      advance(v, undefined, { key: 'vehicleMore', kind: 'chips', chips: [], question: tk.vehicleMissing(parts) })
    } else {
      advance(v, undefined, fuelStep())
    }
  }

  function onContactNext() {
    if (!store.contactName.trim() || !store.contactPhone.trim()) return
    advance(`${store.contactName.trim()} · ${store.contactPhone.trim()}`)
  }

  function shareLocation() {
    if (locating) return
    if (!navigator.geolocation) {
      toast.error(t.aiIntake.locationError)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const address = await reverseGeocode(latitude, longitude)
        setLocating(false)
        // Don't auto-submit: surface the detected address as a confirmable card
        // (the customer taps Bestätigen, or types a correction instead).
        setDetectedLocation(address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
      },
      () => {
        setLocating(false)
        toast.error(t.aiIntake.locationError)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function onPhoto(file: File) {
    setScanning(true)
    setScanned(false)
    const result = await scanVehicleDoc(file, lang)
    setScanning(false)
    if (result.url) store.setVehicleDocUrl(result.url)
    if (result.doc) {
      store.setVehicleDoc(result.doc)
      // Enrich the vehicle field with what we read (make/model/year + fuel).
      const parts = [result.vehicle, result.doc.kraftstoff].filter(Boolean).join(', ')
      if (parts) store.setVehicle(parts)
      setScanned(true)
    } else {
      toast.error(tk.photo.error)
    }
  }

  // Confirm a scanned Fahrzeugschein at the vehicle step: the fuel type is
  // already captured, so move straight on (no separate fuel question).
  function confirmScan() {
    const d = store.vehicleDoc
    const summary = d
      ? `📄 ${[d.marke, d.modell, d.erstzulassung?.slice(0, 4), d.kraftstoff].filter(Boolean).join(' · ')}`
      : `📄 ${store.vehicle || ''}`.trim()
    advance(store.vehicle, summary)
  }

  const progress = Math.round((stepIndex / queue.length) * 100)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <IntakeTabs />

      {/* Progress */}
      <div className="px-4 pt-1 pb-3 border-b">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            {tk.stepLabel(stepIndex + 1, queue.length)}
          </span>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {history.map((bubble, i) => (
          <div key={i} className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {bubble.role === 'assistant' && (
              <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Car className="size-3.5 text-primary-foreground" />
              </div>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-snug whitespace-pre-wrap ${
                bubble.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}
            >
              {bubble.text}
            </div>
          </div>
        ))}
        {scanning && (
          <div className="flex justify-start">
            <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mr-2 mt-0.5">
              <Car className="size-3.5 text-primary-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin shrink-0" />
              <span className="shimmer-text font-medium">{tk.photo.steps[scanStep]}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Controls */}
      <div className="border-t px-4 pb-4 pt-3 space-y-2">
        {step?.kind === 'chips' && (
          <>
            {step.chips && step.chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.chips.map((chip) => (
                  <Button
                    key={chip}
                    variant="outline"
                    size="sm"
                    className="rounded-full font-normal"
                    onClick={() => onChip(chip)}
                  >
                    {chip}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center pt-1">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={tk.typeAnswer}
                className="flex-1 h-10"
                onKeyDown={(e) => e.key === 'Enter' && onText()}
              />
              <Button size="icon-sm" onClick={onText} aria-label={tk.confirm}>
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}

        {step?.kind === 'vehicle' && (
          <>
            {/* Camera capture (mobile) and a plain file picker (gallery/desktop). */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPhoto(f)
                e.target.value = ''
              }}
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPhoto(f)
                e.target.value = ''
              }}
            />
            {scanned && store.vehicleDoc ? (
              <>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{tk.photo.scanned}</p>
                  <div className="space-y-0.5 text-sm">
                    {([
                      ['Kennzeichen', store.vehicleDoc.kennzeichen],
                      ['Marke', [store.vehicleDoc.marke, store.vehicleDoc.modell].filter(Boolean).join(' ')],
                      ['Erstzulassung', store.vehicleDoc.erstzulassung],
                      ['Kraftstoff', store.vehicleDoc.kraftstoff],
                      ['Leistung', store.vehicleDoc.leistung_kw ? `${store.vehicleDoc.leistung_kw} kW` : null],
                      ['FIN', store.vehicleDoc.fin],
                    ] as [string, string | null][])
                      .filter(([, v]) => v)
                      .map(([label, v]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium text-right truncate">{v}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <Button className="w-full justify-center gap-2" onClick={confirmScan}>
                  <CheckCircle2 className="size-4" />
                  {tk.confirm}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="justify-center gap-2" onClick={() => cameraRef.current?.click()} disabled={scanning}>
                    <Camera className="size-4" />
                    {tk.photo.take}
                  </Button>
                  <Button variant="outline" className="justify-center gap-2" onClick={() => uploadRef.current?.click()} disabled={scanning}>
                    <Upload className="size-4" />
                    {tk.photo.upload}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2 items-center">
                  <Input
                    value={vehicleText}
                    onChange={(e) => setVehicleText(e.target.value)}
                    placeholder={tk.vehiclePlaceholder}
                    className="flex-1 h-10"
                    disabled={scanning}
                    onKeyDown={(e) => e.key === 'Enter' && onVehicleNext()}
                  />
                  <Button size="icon-sm" onClick={onVehicleNext} disabled={!vehicleText.trim() || scanning} aria-label={tk.confirm}>
                    <Send className="size-4" />
                  </Button>
                </div>
                {/* Or add the Fahrzeugschein — take a photo or upload a file. */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="justify-center gap-2" onClick={() => cameraRef.current?.click()} disabled={scanning}>
                    <Camera className="size-4 text-primary" />
                    {tk.photo.take}
                  </Button>
                  <Button variant="outline" className="justify-center gap-2" onClick={() => uploadRef.current?.click()} disabled={scanning}>
                    <Upload className="size-4 text-primary" />
                    {tk.photo.upload}
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">{tk.photo.hint}</p>
              </>
            )}
          </>
        )}

        {step?.kind === 'location' && (
          <>
            <Button variant="outline" className="w-full justify-center gap-2" onClick={shareLocation} disabled={locating}>
              {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4 text-primary" />}
              {locating ? t.aiIntake.locating : tk.shareLocation}
            </Button>
            {detectedLocation && (
              <>
                <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{detectedLocation}</span>
                </div>
                <Button className="w-full justify-center gap-2" onClick={() => advance(detectedLocation)}>
                  <CheckCircle2 className="size-4" />
                  {tk.confirm}
                </Button>
              </>
            )}
            <div className="flex gap-2 items-center">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={tk.plzPlaceholder}
                className="flex-1 h-10"
                onKeyDown={(e) => e.key === 'Enter' && onText()}
              />
              <Button size="icon-sm" onClick={onText} disabled={!textInput.trim()} aria-label={tk.confirm}>
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}

        {step?.kind === 'contact' && (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label htmlFor="wiz-name" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="size-3.5" />
                {t.offer.contactName}
              </label>
              <Input
                id="wiz-name"
                autoComplete="name"
                value={store.contactName}
                onChange={(e) => store.setContactName(e.target.value)}
                placeholder={t.offer.contactNamePlaceholder}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="wiz-phone" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="size-3.5" />
                {t.offer.contactPhone}
              </label>
              <Input
                id="wiz-phone"
                type="tel"
                autoComplete="tel"
                value={store.contactPhone}
                onChange={(e) => store.setContactPhone(e.target.value)}
                placeholder={t.offer.contactPhonePlaceholder}
                className="h-10"
                onKeyDown={(e) => e.key === 'Enter' && onContactNext()}
              />
            </div>
            <Button
              className="w-full justify-center gap-2"
              onClick={onContactNext}
              disabled={!store.contactName.trim() || !store.contactPhone.trim()}
            >
              <CheckCircle2 className="size-4" />
              {tk.confirm}
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}
