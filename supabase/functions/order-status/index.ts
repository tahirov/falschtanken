// Read a single order's status by id. Used by the dispatch screen to poll for
// the operator's Telegram Accept/Decline. Uses the service role because anon
// has no SELECT on orders by design; only the status string is exposed.
//
// Body: { id: string }  →  Response: { status }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let id: string | undefined
  try {
    id = (await req.json())?.id
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (!id) return json({ error: 'missing id' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data, error } = await supabase.from('orders').select('status').eq('id', id).maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!data) return json({ error: 'not found' }, 404)
  return json({ status: data.status })
})
