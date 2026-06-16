// Submit a confirmed roadside case: persist it as an order (service role, so
// we get the id back) and notify every registered Telegram operator chat with
// the full cost breakdown and Accept/Decline + quick-link action buttons.
//
// Body: { order: <orders row, snake_case>, quote: <Quote from pricingLogic> }
// Response: { id } on success.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const QUOTE_LABEL: Record<string, string> = {
  base: 'Grundpreis (Anfahrt)',
  eveningSurcharge: 'Zuschlag ab 18 Uhr',
  nightSurcharge: 'Zuschlag ab 22 Uhr',
  weekendSurcharge: 'Wochenendzuschlag',
  pumpDisposal: 'Abpumpen & Entsorgung',
  flush: 'Spülung Tank/Filter/Schlauch',
  delivery: 'Lieferung Kraftstoff',
}

interface QuoteLine { key: string; amount: number }
interface Quote {
  lines: QuoteLine[]
  litres: number
  driveMinutes?: number
  net: number
  vat: number
  gross: number
  eta: number
}
interface VehicleDoc {
  kennzeichen?: string | null
  marke?: string | null
  modell?: string | null
  erstzulassung?: string | null
  kraftstoff?: string | null
  leistung_kw?: string | null
  fin?: string | null
}
interface OrderInput {
  situation?: string
  engine_started?: string
  litres?: string
  location?: string
  vehicle?: string
  contact_name?: string
  contact_phone?: string
  severity?: string
  price?: number
  eta_minutes?: number
  lang?: string
  vehicle_doc?: VehicleDoc | null
  vehicle_doc_url?: string | null
}

function buildText(o: OrderInput, q: Quote | undefined): string {
  const total = q?.gross ?? o.price ?? 0
  const eta = q?.eta ?? o.eta_minutes ?? 0
  const lines: string[] = [
    `🚨 Neuer Auftrag · €${total} · ETA ${eta} Min.`,
    '',
    `🚗 Fahrzeug: ${o.vehicle ?? '—'}`,
    `⛽ Situation: ${o.situation ?? '—'}`,
    `🔑 Motor: ${o.engine_started ?? '—'}`,
    `🛢 Menge: ${o.litres ?? '—'}`,
    `📍 Standort: ${o.location ?? '—'}`,
    `👤 Kunde: ${o.contact_name ?? '—'}`,
    `📞 Telefon: ${o.contact_phone ?? '—'}`,
  ]
  const d = o.vehicle_doc
  if (d && (d.kennzeichen || d.marke || d.fin || d.kraftstoff)) {
    const docBits = [
      d.kennzeichen && `Kennz. ${d.kennzeichen}`,
      d.kraftstoff,
      d.erstzulassung && `EZ ${d.erstzulassung}`,
      d.leistung_kw && `${d.leistung_kw} kW`,
      d.fin && `FIN ${d.fin}`,
    ].filter(Boolean)
    if (docBits.length) lines.push(`📄 Fahrzeugschein: ${docBits.join(' · ')}`)
  }
  if (q?.lines?.length) {
    lines.push('', '💶 Kostenübersicht (netto)')
    for (const l of q.lines) {
      let label = QUOTE_LABEL[l.key] ?? l.key
      if ((l.key === 'pumpDisposal' || l.key === 'delivery') && q.litres) label += ` (${q.litres} L)`
      lines.push(`• ${label}: €${l.amount}`)
    }
    lines.push(`Netto: €${q.net}`, `MwSt 19%: €${q.vat}`, `Gesamt: €${q.gross}`)
  }
  return lines.join('\n')
}

/** Normalise a phone number into a wa.me target (digits incl. country code).
 *  Assumes Germany for the national "0…" format. Returns null if implausible.
 *  Note: wa.me opens WhatsApp regardless; if the number isn't on WhatsApp, the
 *  app itself shows "not on WhatsApp" — we can't detect that server-side. */
function waNumber(phone?: string): string | null {
  let d = (phone ?? '').replace(/[^\d]/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '49' + d.slice(1)
  return d.length >= 10 && d.length <= 15 ? d : null
}

type Btn = { text: string; callback_data?: string; url?: string }

function buildKeyboard(id: string, o: OrderInput) {
  const rows: Btn[][] = [
    [
      { text: '✅ Annehmen', callback_data: `accept:${id}` },
      { text: '❌ Ablehnen', callback_data: `decline:${id}` },
    ],
  ]
  // Contact actions. Telegram forbids tel: button URLs, so "Anrufen" is a
  // callback that makes the bot send the customer as a contact card (which has
  // a native Call button); WhatsApp is a valid wa.me link.
  const wa = waNumber(o.contact_phone)
  const contact: Btn[] = []
  if (wa) contact.push({ text: '📞 Anrufen', callback_data: `call:${id}` })
  if (wa) contact.push({ text: '💬 WhatsApp', url: `https://wa.me/${wa}` })
  if (contact.length) rows.push(contact)

  const info: Btn[] = []
  if (o.location) {
    info.push({
      text: '🗺 Karte',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.location)}`,
    })
  }
  if (o.vehicle_doc_url) info.push({ text: '📄 Fahrzeugschein', url: o.vehicle_doc_url })
  if (info.length) rows.push(info)

  return { inline_keyboard: rows }
}

async function tg(method: string, body: unknown): Promise<any> {
  if (!BOT) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await r.json()
  } catch (_) {
    // best-effort: a notification failure must not fail the order
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let payload: { order?: OrderInput; quote?: Quote }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const order = payload.order ?? {}
  const quote = payload.quote

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: inserted, error } = await supabase
    .from('orders')
    .insert({ ...order, status: 'requested' })
    .select('id')
    .single()
  if (error || !inserted) return json({ error: error?.message ?? 'insert failed' }, 500)

  const id = inserted.id as string

  // Notify all registered operator chats (best-effort).
  const { data: subs } = await supabase.from('telegram_subscribers').select('chat_id')
  if (subs?.length) {
    const text = buildText(order, quote)
    const reply_markup = buildKeyboard(id, order)
    await Promise.all(
      subs.map((s) =>
        tg('sendMessage', { chat_id: s.chat_id, text, reply_markup, disable_web_page_preview: true }),
      ),
    )
  }

  return json({ id })
})
