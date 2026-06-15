export type Severity = 'low' | 'medium' | 'high'

export function calculateSeverity(engineStarted: string): Severity {
  const lower = engineStarted.toLowerCase()
  if (
    lower.includes('gar nicht') ||
    lower.includes('nein') ||
    lower.includes('not at all') ||
    lower.includes('no,') ||
    lower.includes('wcale')
  ) {
    return 'low'
  }
  if (
    lower.includes('kurz') ||
    lower.includes('briefly') ||
    lower.includes('krótko') ||
    lower.includes('angelassen')
  ) {
    return 'medium'
  }
  if (
    lower.includes('gefahren') ||
    lower.includes('ja,') ||
    lower.includes('drove') ||
    lower.includes('jechałem') ||
    lower.includes('yes,')
  ) {
    return 'high'
  }
  // default unsure → medium
  return 'medium'
}

export function calculatePrice(engineStarted: string): number {
  const severity = calculateSeverity(engineStarted)
  let price = 150
  if (severity === 'medium') price += 40
  if (severity === 'high') price += 80
  return price
}

export function generateEta(): number {
  return Math.floor(Math.random() * (55 - 25 + 1)) + 25
}

// ---------------------------------------------------------------------------
// Quote breakdown
// ---------------------------------------------------------------------------
// Placeholder pricing model: a fixed call-out for draining the misfuelled tank,
// disposal billed per affected litre, a flat drive-out fee, and labour at an
// hourly rate that rises in the evening, at night and on weekends.

export type RateNote = 'standard' | 'evening' | 'night' | 'weekend' | 'weekendNight'

export interface QuoteLine {
  key: 'removal' | 'disposal' | 'driving' | 'labour'
  amount: number
}

export interface Quote {
  lines: QuoteLine[]
  litres: number
  labourHours: number
  hourlyRate: number
  rateNote: RateNote
  total: number
  eta: number
  severity: Severity
}

const REMOVAL_BASE: Record<Severity, number> = { low: 120, medium: 160, high: 220 }
const LABOUR_HOURS: Record<Severity, number> = { low: 1, medium: 1.5, high: 2 }
const DISPOSAL_PER_LITRE = 3
const DRIVING_FLAT = 49
const BASE_HOURLY = 90

/** Best-effort litres from a free-text answer (e.g. "20 L petrol, 5 L diesel"). */
export function parseLitres(text: string): number {
  const matches = (text ?? '').match(/\d+(?:[.,]\d+)?/g)
  if (!matches) return 20
  const nums = matches.map((n) => parseFloat(n.replace(',', '.'))).filter((n) => n > 0)
  if (!nums.length) return 20
  return Math.min(Math.max(Math.max(...nums), 1), 80)
}

function hourlyRate(date: Date): { rate: number; note: RateNote } {
  const day = date.getDay() // 0 = Sunday … 6 = Saturday
  const hour = date.getHours()
  const weekend = day === 0 || day === 6
  const night = hour >= 22 || hour < 6
  const evening = !night && hour >= 18
  if (night) return { rate: weekend ? 165 : 150, note: weekend ? 'weekendNight' : 'night' }
  if (weekend) return { rate: 130, note: 'weekend' }
  if (evening) return { rate: 110, note: 'evening' }
  return { rate: BASE_HOURLY, note: 'standard' }
}

export function calculateQuote(
  engineStarted: string,
  litresText: string,
  now: Date = new Date(),
): Quote {
  const severity = calculateSeverity(engineStarted)
  const litres = parseLitres(litresText)
  const { rate, note } = hourlyRate(now)
  const labourHours = LABOUR_HOURS[severity]

  const lines: QuoteLine[] = [
    { key: 'removal', amount: REMOVAL_BASE[severity] },
    { key: 'disposal', amount: Math.round(litres * DISPOSAL_PER_LITRE) },
    { key: 'driving', amount: DRIVING_FLAT },
    { key: 'labour', amount: Math.round(labourHours * rate) },
  ]
  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { lines, litres, labourHours, hourlyRate: rate, rateNote: note, total, eta: generateEta(), severity }
}
