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
