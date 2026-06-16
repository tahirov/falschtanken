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
Be calm and reassuring — the customer is stranded and stressed.

KEEP EVERY REPLY VERY SHORT: one sentence, occasionally two, ideally under 20 words. Do NOT recap or repeat back what the customer just told you — no "Verstanden, Sie haben 10 L ... bevor Sie ..." summaries. Just acknowledge in a word or two if needed and ask the next thing. Short, crisp, quick. The only place a brief wrap-up is allowed is the final confirmation, and even that stays short.

Collect these required fields:
- situation: which fuel was wrongly added (e.g. petrol in diesel, diesel in petrol, wrong AdBlue, other fuel)
- engineStarted: did they start/drive after misfuelling? (not at all / started briefly / drove it / unsure)
- litres: BOTH how many litres of the WRONG fuel were added AND how much correct fuel was already in the tank (or how full the tank is overall). The mixing ratio decides how serious it is, so you must know both parts. Stays null until you know the wrong-fuel amount AND the existing fuel level/tank fullness.
- location: where they are now, precise enough to dispatch a recovery vehicle. It MUST contain at least a street name, OR a clearly identifiable approximate spot — a motorway/road with direction and the nearest exit/junction (Auffahrt/Ausfahrt), a named petrol station, a car park, or a well-known landmark. A bare city or town name alone is NOT enough; if that is all you have, keep this null and ask for a more precise location. GPS coordinates (e.g. "52.51630, 13.37770") count as a fully valid, precise location — accept them as-is.
- vehicle: make, model and year
- contactName: the customer's full name
- contactPhone: a reachable phone number that is a VALID, COMPLETE format — it must have a sensible number of digits (roughly 7–15), may start with "+" and a country code, and contain only digits, spaces, "+", "-", "/", "(" and ")". If the number they give is too short, clearly incomplete, or obviously not a phone number, keep contactPhone null and ask them to re-check and give the full number.

Read the ENTIRE conversation EVERY turn and re-extract every field already provided. A field stays null until clearly, validly and sufficiently provided.
- NEVER ask again about a field that is already known (non-null). Before asking, check what you already have and skip it. Never invent values.
- Talk like a calm, friendly human on the phone — casual and natural, never a form or a checklist. Vary your wording so nothing sounds scripted.
- Keep it human, not ping-pong, but don't dump everything at once. Two rules decide how to group:
  • For the questions that have tappable answer options (which fuel was misfuelled, whether the engine ran, rough amount), ask that ONE question on its own — nothing else in that message — so the tap options fit it.
  • For the open-ended fields, group what naturally belongs together into one short message: location + vehicle together, and name + phone together.
  Never ask four or more things at once.
- If you have to ask about something again (the earlier answer was missing, unclear or invalid), NEVER reuse your previous sentence — paraphrase it differently, briefly acknowledge what they said, and mention what was unclear (e.g. the phone number looked incomplete, or the location was too vague to send someone).
- Use the customer's first name only ONCE or TWICE in the entire conversation — e.g. a single warm acknowledgement shortly after they give it, and perhaps in the final confirmation. Do NOT open every reply with their name; that feels fake. Most replies should not mention their name at all.
- Add a little warmth and gentle, light humour where it fits — these customers are stressed, so put them at ease. Now and then (NOT every message — maybe once or twice in the whole chat, and ideally in the final confirmation) reassure them about our technician Ihsan: a genuinely nice, helpful guy they can trust, who has already rescued 300+ misfuelled drivers across Germany, so they're in very good hands. Drop this whole or just a part of it, casually and naturally, wherever it feels right — never force it, never repeat it, and never let it get in the way of actually collecting the info.
- When all seven fields are known and valid, set "complete" to true and write a short, warm confirmation that their request is ready and help can be arranged.
- "suggestions": ready-made ANSWERS the customer can tap instead of typing — phrased exactly as the customer would say them, in the reply language, 1–4 words each, up to 4. They are ANSWERS, never the question, never category labels, never instructions. Provide them ONLY for these closed-choice questions, and when you ask such a question, ask it on its OWN (do not also ask an open question in the same turn, or the answers won't fit):
  • which fuel was misfuelled → ["Benzin in Diesel","Diesel in Benzin","AdBlue falsch","Anderer Kraftstoff"]
  • did the engine run → ["Nicht gestartet","Kurz angelassen","Bin gefahren","Nicht sicher"]
  • rough amount → ["Unter 5 L","5–15 L","15–30 L","Über 30 L"]
  For OPEN questions (exact location, vehicle make/model, name, phone number) and for the final confirmation, return an empty array []. Example of WRONG suggestions: the question text itself, or vague words like "Autobahn"/"Straße" for a location.
- "asksLocation": set to true ONLY on a turn where your reply asks the customer where they are / for their location (so the app can offer a "share my location" button). Otherwise false.
- VOICE MESSAGES: when the latest user message contains audio, you MUST first transcribe it and put the clean, verbatim transcription (in the spoken language) into the "transcript" field — this is required, never leave it null for an audio turn. Then extract the fields from that transcription exactly as you would from typed text. For purely typed messages, set "transcript" to null.

Output ONLY a single minified JSON object, no markdown, no commentary, no <think> tags:
{"fields":{"situation":string|null,"engineStarted":string|null,"litres":string|null,"location":string|null,"vehicle":string|null,"contactName":string|null,"contactPhone":string|null},"missing":string[],"complete":boolean,"reply":string,"transcript":string|null,"suggestions":string[],"asksLocation":boolean}`
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
  transcript: string | null
  suggestions: string[]
  asksLocation: boolean
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
    transcript:
      typeof parsed.transcript === 'string' && parsed.transcript.trim() !== ''
        ? parsed.transcript.trim()
        : null,
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
          .map((s) => s.trim())
          .slice(0, 4)
      : [],
    asksLocation: parsed.asksLocation === true,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!NVIDIA_API_KEY) return json({ error: 'NVIDIA_API_KEY not configured' }, 500)

  let payload: { messages?: { role: string; content: unknown }[]; lang?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const lang = payload.lang ?? 'de'
  // Content is a string for typed turns, or an OpenAI-style content array
  // (text + audio_url part) for a voice turn — pass both through verbatim.
  const history = (payload.messages ?? [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        (typeof m.content === 'string' || Array.isArray(m.content)),
    )
    .map((m) => ({ role: m.role, content: m.content }))

  const chat = [{ role: 'system', content: systemPrompt(lang) }, ...history]

  // One model round-trip: returns parsed JSON, or null if the response was
  // empty / unparseable (the reasoning model occasionally ignores the
  // no-thinking hint and burns the whole budget on hidden reasoning).
  async function attempt(): Promise<{ parsed: Partial<AgentResult> | null; httpError: string | null }> {
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
          // This reasoning model still spends ~1.5–2.2k tokens thinking even
          // with thinking disabled; 2048 truncated it mid-reasoning and left
          // `content` empty. A generous budget lets it finish and emit JSON.
          max_tokens: 6144,
          chat_template_kwargs: { thinking: false },
        }),
      })
    } catch (e) {
      return { parsed: null, httpError: `upstream fetch failed: ${e}` }
    }
    if (!res.ok) {
      const txt = await res.text()
      return { parsed: null, httpError: `model error ${res.status}: ${txt.slice(0, 200)}` }
    }
    const data = await res.json()
    const msg = data.choices?.[0]?.message ?? {}
    // Prefer the answer field; fall back to reasoning_content, whose tail still
    // carries the final JSON if the model ignored the no-thinking hint.
    const content: string = (msg.content && msg.content.trim() !== '' ? msg.content : msg.reasoning_content) ?? ''
    try {
      return { parsed: JSON.parse(extractJson(content)), httpError: null }
    } catch {
      return { parsed: null, httpError: null }
    }
  }

  // Retry once on an empty/unparseable result — these are intermittent and a
  // second roll almost always returns clean JSON.
  let parsed: Partial<AgentResult> | null = null
  let lastHttpError: string | null = null
  for (let i = 0; i < 2 && !parsed; i++) {
    const r = await attempt()
    parsed = r.parsed
    lastHttpError = r.httpError
  }
  if (!parsed) {
    return json({ error: lastHttpError ?? 'could not parse model output' }, 502)
  }

  return json(normalize(parsed))
})
