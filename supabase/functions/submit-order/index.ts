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

const LINE_LABEL: Record<string, string> = {
  removal: 'Absaugen des Falschkraftstoffs',
  disposal: 'Entsorgung',
  driving: 'Anfahrt',
  labour: 'Arbeitszeit',
}
const RATE_LABEL: Record<string, string> = {
  standard: 'Normaltarif',
  evening: 'Abendzuschlag',
  night: 'Nachtzuschlag',
  weekend: 'Wochenendzuschlag',
  weekendNight: 'Wochenend-/Nachtzuschlag',
}

interface QuoteLine { key: string; amount: number }
interface Quote {
  lines: QuoteLine[]
  litres: number
  labourHours: number
  hourlyRate: number
  rateNote: string
  total: number
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
  const total = q?.total ?? o.price ?? 0
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
    lines.push('', '💶 Kostenübersicht')
    for (const l of q.lines) {
      let label = LINE_LABEL[l.key] ?? l.key
      if (l.key === 'disposal') label += ` (${q.litres} L)`
      if (l.key === 'labour') label += ` (${q.labourHours} Std. × €${q.hourlyRate}/Std., ${RATE_LABEL[q.rateNote] ?? q.rateNote})`
      lines.push(`• ${label}: €${l.amount}`)
    }
    lines.push(`Gesamt: €${q.total}`)
  }
  return lines.join('\n')
}

function buildKeyboard(id: string, o: OrderInput) {
  const rows: { text: string; callback_data?: string; url?: string }[][] = [
    [
      { text: '✅ Annehmen', callback_data: `accept:${id}` },
      { text: '❌ Ablehnen', callback_data: `decline:${id}` },
    ],
  ]
  const links: { text: string; url: string }[] = []
  if (o.location) {
    links.push({
      text: '🗺 Karte öffnen',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.location)}`,
    })
  }
  // No WhatsApp/call button here: Telegram inline buttons can't carry a tel:
  // link, and on accept we send the customer as a tappable contact card (with a
  // native Call button), so calling is handled there.
  if (o.vehicle_doc_url) {
    links.push({ text: '📄 Fahrzeugschein', url: o.vehicle_doc_url })
  }
  if (links.length) rows.push(links)
  return { inline_keyboard: rows }
}

async function tg(method: string, body: unknown): Promise<void> {
  if (!BOT) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (_) {
    // best-effort: a notification failure must not fail the order
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
