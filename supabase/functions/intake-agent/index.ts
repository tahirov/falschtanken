// Tankhilfe24 intake agent — uses NVIDIA Nemotron omni to extract the required
// case fields from a free-text (later: voice) conversation, asking follow-up
// questions until everything needed is collected.
//
// Request body: { messages: {role:'user'|'assistant', content:string}[], lang?: 'de'|'en'|'pl' }
// Response:     { fields, missing: string[], complete: boolean, reply: string }

const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY')
const NVIDIA_BASE = Deno.env.get('NVIDIA_BASE_URL') ?? 'https://integrate.api.nvidia.com/v1'
const MODEL = Deno.env.get('NVIDIA_MODEL') ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const FIELDS = [
  'situation',
  'engineStarted',
  'litres',
  'location',
  'vehicle',
  'contactName',
  'contactPhone',
] as const

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

function systemPrompt(lang: string): string {
  return `You are the intake assistant for "Tankhilfe24", a 24/7 roadside rescue service for misfuelling (putting the wrong fuel in a vehicle).
Always write your "reply" in this language code: "${lang}".
Be calm, brief and reassuring — the customer is stranded and stressed.

Collect these required fields:
- situation: which fuel was wrongly added (e.g. petrol in diesel, diesel in petrol, wrong AdBlue, other fuel)
- engineStarted: did they start/drive after misfuelling? (not at all / started briefly / drove it / unsure)
- litres: roughly how many litres were misfuelled and/or how full the tank is
- location: where they are now (road + exit, city, or an address)
- vehicle: make, model and year
- contactName: the customer's full name
- contactPhone: a phone number to reach them

Read the ENTIRE conversation and extract every field that is known. A field stays null until clearly provided.
- If one or more required fields are still null, ask ONE short friendly question for the single most important missing field. Never ask for more than one field at a time. Never invent values.
- When all seven fields are known, set "complete" to true and write a short confirmation that help is being arranged.

Output ONLY a single minified JSON object, no markdown, no commentary, no <think> tags:
{"fields":{"situation":string|null,"engineStarted":string|null,"litres":string|null,"location":string|null,"vehicle":string|null,"contactName":string|null,"contactPhone":string|null},"missing":string[],"complete":boolean,"reply":string}`
}

/** Pull a JSON object out of a possibly-reasoning model response. */
function extractJson(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1)
  return t
}

interface AgentResult {
  fields: Record<string, string | null>
  missing: string[]
  complete: boolean
  reply: string
}

function normalize(parsed: Partial<AgentResult>): AgentResult {
  const fields: Record<string, string | null> = {}
  for (const f of FIELDS) {
    const v = parsed.fields?.[f]
    fields[f] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  const missing = FIELDS.filter((f) => fields[f] === null)
  return {
    fields,
    missing,
    complete: missing.length === 0,
    reply: typeof parsed.reply === 'string' ? parsed.reply : '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!NVIDIA_API_KEY) return json({ error: 'NVIDIA_API_KEY not configured' }, 500)

  let payload: { messages?: { role: string; content: string }[]; lang?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const lang = payload.lang ?? 'de'
  const history = (payload.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.content }))

  const chat = [{ role: 'system', content: systemPrompt(lang) }, ...history]

  let res: Response
  try {
    res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: chat,
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2048,
        // This is a reasoning model: left on, it can spend the whole token
        // budget thinking and return an empty `content`. We only need the JSON.
        chat_template_kwargs: { thinking: false },
      }),
    })
  } catch (e) {
    return json({ error: `upstream fetch failed: ${e}` }, 502)
  }

  if (!res.ok) {
    const txt = await res.text()
    return json({ error: `model error ${res.status}`, detail: txt.slice(0, 500) }, 502)
  }

  const data = await res.json()
  const msg = data.choices?.[0]?.message ?? {}
  // Prefer the answer field; fall back to reasoning_content, whose tail still
  // carries the final JSON if the model ignored the no-thinking hint.
  const content: string = (msg.content && msg.content.trim() !== '' ? msg.content : msg.reasoning_content) ?? ''
  let parsed: Partial<AgentResult>
  try {
    parsed = JSON.parse(extractJson(content))
  } catch {
    return json({ error: 'could not parse model output', raw: content.slice(0, 800) }, 502)
  }

  return json(normalize(parsed))
})
