// Persist the in-progress AI intake to localStorage so a page refresh (or a
// direct visit to /chat) restores the conversation, collected fields and quote
// instead of starting over.

import type { AgentMessage } from '@/lib/intakeAgent'
import type { Quote } from '@/lib/pricingLogic'

const KEY = 'tankhilfe.chat.v1'

export interface ChatSnapshot {
  lang: string
  messages: AgentMessage[]
  suggestions: string[]
  quote: Quote | null
  eta: number
  price: number
  fields: {
    situation: string
    engineStarted: string
    litres: string
    location: string
    vehicle: string
    contactName: string
    contactPhone: string
  }
}

export function loadChat(): ChatSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ChatSnapshot
    if (!s || !Array.isArray(s.messages) || s.messages.length === 0) return null
    return s
  } catch {
    return null
  }
}

export function saveChat(snapshot: ChatSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function clearChat(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
