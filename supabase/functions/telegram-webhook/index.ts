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
    if ((action === 'accept' || action === 'decline') && id) {
      const status = action === 'accept' ? 'dispatched' : 'cancelled'
      const chatId = String(cq.message?.chat?.id ?? '')
      const patch: Record<string, unknown> = { status }
      if (action === 'accept') patch.accepted_chat_id = chatId
      await supabase.from('orders').update(patch).eq('id', id)
      const stamp = action === 'accept' ? '✅ ANGENOMMEN' : '❌ ABGELEHNT'
      const by = cq.from?.first_name ? ` · ${cq.from.first_name}` : ''
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: stamp })
      if (cq.message) {
        // Re-stamp the message and drop the buttons so it can't be re-actioned.
        await tg('editMessageText', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text: `${cq.message.text ?? ''}\n\n${stamp}${by}`,
        })
      }
      // On accept, send the customer as a tappable contact card so the
      // technician can call with one tap — works even after the buttons go.
      if (action === 'accept' && chatId) {
        const { data: ord } = await supabase
          .from('orders')
          .select('contact_name, contact_phone')
          .eq('id', id)
          .maybeSingle()
        if (ord?.contact_phone) {
          await tg('sendContact', {
            chat_id: chatId,
            phone_number: ord.contact_phone,
            first_name: ord.contact_name || 'Kunde',
          })
        }
      }
    } else {
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
    }
    return new Response('ok')
  }

  return new Response('ok')
})
