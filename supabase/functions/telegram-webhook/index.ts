// Telegram webhook: handles bot updates.
//  - /start  → registers the chat so it receives new orders.
//  - Accept/Decline button → updates the order status and stamps the message.
//
// Telegram calls this directly (no Supabase JWT), so deploy with
// --no-verify-jwt. Requests are authenticated by the secret token Telegram
// echoes in the X-Telegram-Bot-Api-Secret-Token header (set via setWebhook).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Customer-facing order summary (customer's language) for the WhatsApp prefill. */
function customerSummary(o: {
  situation?: string | null; vehicle?: string | null; location?: string | null
  eta_minutes?: number | null; price?: number | null; lang?: string | null
}): string {
  const lang = o.lang === 'en' ? 'en' : o.lang === 'pl' ? 'pl' : 'de'
  const eta = o.eta_minutes ?? 0
  const T = {
    de: { title: 'Tankhilfe24 – Ihr Auftrag', sit: 'Situation', veh: 'Fahrzeug', loc: 'Standort', eta: `Techniker Ihsan ist unterwegs – Ankunft in ca. ${eta} Min.`, price: 'Festpreis', foot: 'Bei Fragen einfach hier antworten.' },
    en: { title: 'Tankhilfe24 – Your job', sit: 'Situation', veh: 'Vehicle', loc: 'Location', eta: `Technician Ihsan is on the way – arriving in approx. ${eta} min.`, price: 'Fixed price', foot: 'Any questions, just reply here.' },
    pl: { title: 'Tankhilfe24 – Twoje zlecenie', sit: 'Sytuacja', veh: 'Pojazd', loc: 'Lokalizacja', eta: `Technik Ihsan jest w drodze – przyjazd za ok. ${eta} min.`, price: 'Cena stała', foot: 'W razie pytań po prostu odpowiedz tutaj.' },
  }[lang]
  return [
    T.title,
    o.situation ? `${T.sit}: ${o.situation}` : '',
    o.vehicle ? `${T.veh}: ${o.vehicle}` : '',
    o.location ? `${T.loc}: ${o.location}` : '',
    T.eta,
    `${T.price}: €${o.price ?? 0}`,
    T.foot,
  ].filter(Boolean).join('\n')
}

/** Phone → wa.me target (digits incl. country code); assumes Germany for "0…". */
function waNumber(phone?: string | null): string | null {
  let d = (phone ?? '').replace(/[^\d]/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '49' + d.slice(1)
  return d.length >= 10 && d.length <= 15 ? d : null
}

async function tg(method: string, body: unknown): Promise<void> {
  if (!BOT) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (_) { /* ignore */ }
}

Deno.serve(async (req) => {
  // Health check / browser hit.
  if (req.method !== 'POST') return new Response('ok')
  if (SECRET && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return new Response('ok')
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  // 1) Registration via /start
  const msg = update.message
  if (msg?.text && String(msg.text).trim().toLowerCase().startsWith('/start')) {
    const chat = msg.chat
    const title =
      chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') ?? chat.username ?? null
    await supabase
      .from('telegram_subscribers')
      .upsert({ chat_id: String(chat.id), title }, { onConflict: 'chat_id' })
    await tg('sendMessage', {
      chat_id: chat.id,
      text: '✅ Registriert. Sie erhalten ab jetzt neue Aufträge hier in diesem Chat.',
    })
    return new Response('ok')
  }

  // 2) Accept / Decline button
  const cq = update.callback_query
  if (cq?.data) {
    const [action, id] = String(cq.data).split(':')
    // "Anrufen" button: send the customer as a contact card (native Call button).
    if (action === 'call' && id) {
      const { data: ord } = await supabase
        .from('orders')
        .select('contact_name, contact_phone')
        .eq('id', id)
        .maybeSingle()
      if (ord?.contact_phone && cq.message?.chat?.id) {
        await tg('sendContact', {
          chat_id: cq.message.chat.id,
          phone_number: ord.contact_phone,
          first_name: ord.contact_name || 'Kunde',
        })
      }
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '📇 Kontakt gesendet' })
      return new Response('ok')
    }
    if ((action === 'accept' || action === 'decline') && id) {
      const status = action === 'accept' ? 'dispatched' : 'cancelled'
      const chatId = String(cq.message?.chat?.id ?? '')
      const patch: Record<string, unknown> = { status }
      if (action === 'accept') patch.accepted_chat_id = chatId
      await supabase.from('orders').update(patch).eq('id', id)
      const stamp = action === 'accept' ? '✅ ANGENOMMEN' : '❌ ABGELEHNT'
      const by = cq.from?.first_name ? ` · ${cq.from.first_name}` : ''
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: stamp })

      // Fetch order details for the contact card + the quick-link buttons.
      const { data: ord } = await supabase
        .from('orders')
        .select('contact_name, contact_phone, location, vehicle_doc_url, situation, vehicle, eta_minutes, price, lang')
        .eq('id', id)
        .maybeSingle()

      if (cq.message) {
        // On accept: re-stamp and keep the map/Fahrzeugschein quick links, but
        // drop Accept/Ablehnen so the job can't be re-actioned. On decline: drop
        // all buttons. (Telegram removes the keyboard unless reply_markup is set.)
        let reply_markup: unknown
        if (action === 'accept' && ord) {
          const rows: { text: string; url?: string; callback_data?: string }[][] = []
          const wa = waNumber(ord.contact_phone)
          const contact: { text: string; url?: string; callback_data?: string }[] = []
          if (wa) contact.push({ text: '📞 Anrufen', callback_data: `call:${id}` })
          if (wa) contact.push({ text: '💬 WhatsApp', url: `https://wa.me/${wa}` })
          if (contact.length) rows.push(contact)
          if (wa) {
            const summary = encodeURIComponent(customerSummary(ord))
            rows.push([{ text: '📋 Zusammenfassung an Kunde', url: `https://wa.me/${wa}?text=${summary}` }])
          }
          const info: { text: string; url?: string }[] = []
          if (ord.location) {
            info.push({
              text: '🗺 Karte',
              url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ord.location)}`,
            })
          }
          if (ord.vehicle_doc_url) info.push({ text: '📄 Fahrzeugschein', url: ord.vehicle_doc_url })
          if (info.length) rows.push(info)
          if (rows.length) reply_markup = { inline_keyboard: rows }
        }
        await tg('editMessageText', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text: `${cq.message.text ?? ''}\n\n${stamp}${by}`,
          ...(reply_markup ? { reply_markup } : {}),
        })
      }
      // On accept, send the customer as a tappable contact card so the
      // technician can CALL with one tap (Telegram's native Call button).
      if (action === 'accept' && chatId && ord?.contact_phone) {
        await tg('sendContact', {
          chat_id: chatId,
          phone_number: ord.contact_phone,
          first_name: ord.contact_name || 'Kunde',
        })
      }
    } else {
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
    }
    return new Response('ok')
  }

  return new Response('ok')
})
