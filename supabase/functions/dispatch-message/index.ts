// Forward a customer's dispatch-chat message to the assigned technician on
// Telegram (one-way). Sends to the chat that accepted the order, falling back
// to all registered operator chats.
//
// Body: { orderId: string, text: string }  →  Response: { ok: true }

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

async function tg(chatId: string, text: string): Promise<void> {
  if (!BOT) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
  } catch (_) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let payload: { orderId?: string; text?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const text = (payload.text ?? '').trim()
  if (!payload.orderId || !text) return json({ error: 'missing orderId or text' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: order } = await supabase
    .from('orders')
    .select('contact_name, accepted_chat_id')
    .eq('id', payload.orderId)
    .maybeSingle()

  const who = order?.contact_name ? ` von ${order.contact_name}` : ''
  const message = `💬 Kundennachricht${who}:\n${text.slice(0, 1500)}`

  if (order?.accepted_chat_id) {
    await tg(order.accepted_chat_id, message)
  } else {
    const { data: subs } = await supabase.from('telegram_subscribers').select('chat_id')
    await Promise.all((subs ?? []).map((s) => tg(s.chat_id, message)))
  }

  return json({ ok: true })
})
