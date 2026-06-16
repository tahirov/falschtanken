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
// Quote breakdown — official Tankhilfe24 price sheet (net prices, + 19% VAT).
// ---------------------------------------------------------------------------
// • Grundpreis by drive-time zone from our base: ≤30 min 200€, ≤60 min 300€,
//   then +100€ per additional 30 min.
// • Time surcharges: from 18:00 +50€, from 22:00 +70€, weekend +90€.
// • Abpumpen & Entsorgung 2€/L, Spülung 90€ (when the engine ran),
//   Lieferung Diesel/Benzin 2€/L.

export const VAT_RATE = 0.19

export type QuoteLineKey =
  | 'base'
  | 'eveningSurcharge'
  | 'nightSurcharge'
  | 'weekendSurcharge'
  | 'pumpDisposal'
  | 'flush'
  | 'delivery'

export interface QuoteLine {
  key: QuoteLineKey
  amount: number
}

export interface Quote {
  lines: QuoteLine[]
  litres: number
  driveMinutes: number
  net: number
  vat: number
  gross: number
  /** Estimated arrival in minutes (≈ drive time). */
  eta: number
  severity: Severity
}

/** Best-effort litres from a free-text answer (e.g. "5–15 Liter, Tank fast leer"). */
export function parseLitres(text: string): number {
  const matches = (text ?? '').match(/\d+(?:[.,]\d+)?/g)
  if (!matches) return 20
  const nums = matches.map((n) => parseFloat(n.replace(',', '.'))).filter((n) => n > 0)
  if (!nums.length) return 20
  return Math.min(Math.max(Math.max(...nums), 1), 80)
}

/** Grundpreis from the drive-time zone. */
function basePrice(driveMinutes: number): number {
  if (driveMinutes <= 30) return 200
  if (driveMinutes <= 60) return 300
  return 300 + 100 * Math.ceil((driveMinutes - 60) / 30)
}

export function calculateQuote(
  driveMinutes: number,
  litresText: string,
  engineStarted: string,
  now: Date = new Date(),
): Quote {
  const severity = calculateSeverity(engineStarted)
  const litres = parseLitres(litresText)
  const m = Math.max(0, Math.round(driveMinutes))

  const lines: QuoteLine[] = [{ key: 'base', amount: basePrice(m) }]

  const hour = now.getHours()
  const weekend = now.getDay() === 0 || now.getDay() === 6
  if (hour >= 22) lines.push({ key: 'nightSurcharge', amount: 70 })
  else if (hour >= 18) lines.push({ key: 'eveningSurcharge', amount: 50 })
  if (weekend) lines.push({ key: 'weekendSurcharge', amount: 90 })

  lines.push({ key: 'pumpDisposal', amount: litres * 2 })
  if (severity !== 'low') lines.push({ key: 'flush', amount: 90 })
  lines.push({ key: 'delivery', amount: litres * 2 })

  const net = lines.reduce((sum, l) => sum + l.amount, 0)
  const vat = Math.round(net * VAT_RATE)
  const gross = net + vat
  return { lines, litres, driveMinutes: m, net, vat, gross, eta: Math.max(m, 1), severity }
}
