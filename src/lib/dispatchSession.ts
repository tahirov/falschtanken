// Persist the active dispatch so refreshing /dispatch resumes the REAL order
// tracking (polling Telegram-driven status) instead of falling back to the
// timed demo sequence.

const KEY = 'tankhilfe.dispatch.v1'

export interface DispatchMessage {
  id: number
  from: 'tech' | 'user' | 'system'
  text: string
}

export interface DispatchSnapshot {
  orderId: string
  price: number
  eta: number
  /** Absolute arrival deadline (ms epoch) so the countdown survives refresh. */
  arrivalAt?: number
  /** Conversation with the technician, so it survives a refresh. */
  messages?: DispatchMessage[]
}

export function loadDispatch(): DispatchSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DispatchSnapshot
    return s && typeof s.orderId === 'string' ? s : null
  } catch {
    return null
  }
}

export function saveDispatch(snapshot: DispatchSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* ignore */
  }
}

export function clearDispatch(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
