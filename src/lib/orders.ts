import { supabase } from '@/lib/supabase'
import type { Severity } from '@/lib/pricingLogic'

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
    severity: order.severity,
    price: order.price,
    eta_minutes: order.eta_minutes,
    lang: order.lang,
    status: 'requested',
  })
  return { error: error?.message ?? null }
}
