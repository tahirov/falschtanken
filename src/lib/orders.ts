import { supabase } from '@/lib/supabase'
import type { Severity, Quote } from '@/lib/pricingLogic'

export type OrderStatus = 'requested' | 'dispatched' | 'completed' | 'cancelled'

export interface Order {
  id: string
  created_at: string
  situation: string | null
  engine_started: string | null
  litres: string | null
  location: string | null
  vehicle: string | null
  severity: Severity | null
  price: number | null
  eta_minutes: number | null
  lang: string | null
  status: OrderStatus
  contact_name: string | null
  contact_phone: string | null
}

export interface NewOrder {
  situation: string
  engine_started: string
  litres: string
  location: string
  vehicle: string
  contact_name: string
  contact_phone: string
  severity: Severity
  price: number
  eta_minutes: number
  lang: string
}

/**
 * Persist a completed case as an order (the admin "log" entry).
 * Inserts via the anon key — allowed by RLS — and does not read the row back
 * (anon has no SELECT permission on orders by design).
 */
export async function createOrder(order: NewOrder): Promise<{ error: string | null }> {
  const { error } = await supabase.from('orders').insert({
    situation: order.situation,
    engine_started: order.engine_started,
    litres: order.litres,
    location: order.location,
    vehicle: order.vehicle,
    contact_name: order.contact_name,
    contact_phone: order.contact_phone,
    severity: order.severity,
    price: order.price,
    eta_minutes: order.eta_minutes,
    lang: order.lang,
    status: 'requested',
  })
  return { error: error?.message ?? null }
}

/**
 * Submit a confirmed case via the `submit-order` edge function, which persists
 * the order AND notifies the Telegram operator chat(s) with action buttons.
 * Falls back to a plain anon insert so the funnel never loses an order if the
 * function is unreachable.
 */
export async function submitOrder(
  order: NewOrder,
  quote: Quote,
): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase.functions.invoke('submit-order', {
    body: {
      order: {
        situation: order.situation,
        engine_started: order.engine_started,
        litres: order.litres,
        location: order.location,
        vehicle: order.vehicle,
        contact_name: order.contact_name,
        contact_phone: order.contact_phone,
        severity: order.severity,
        price: order.price,
        eta_minutes: order.eta_minutes,
        lang: order.lang,
      },
      quote,
    },
  })
  if (error || data?.error) {
    const fallback = await createOrder(order)
    return { error: fallback.error, id: null }
  }
  return { error: null, id: (data?.id as string) ?? null }
}

/** Poll a single order's status (operator Accept/Decline arrives via Telegram). */
export async function getOrderStatus(id: string): Promise<OrderStatus | null> {
  const { data, error } = await supabase.functions.invoke('order-status', { body: { id } })
  if (error || !data || data.error) return null
  return data.status as OrderStatus
}
