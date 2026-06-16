// Tankhilfe24 — scan a German vehicle registration document (Fahrzeugschein /
// Zulassungsbescheinigung Teil I) with a NVIDIA NIM vision model and return only
// the necessary fields as clean, human-readable JSON. The image itself is stored
// separately by the client (Supabase Storage) as a reference; this function only
// does the OCR/extraction.
//
// Request body: { image: base64 JPG/PNG (no data-URI prefix), mime?: string, lang?: string }
// Response:     { doc: {...necessary fields...}, vehicle: string }  // vehicle = "Marke Modell Baujahr"

const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY')
const NVIDIA_BASE = Deno.env.get('NVIDIA_BASE_URL') ?? 'https://integrate.api.nvidia.com/v1'
const VISION_MODEL = Deno.env.get('NVIDIA_VISION_MODEL') ?? 'meta/llama-3.2-90b-vision-instruct'

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

function prompt(lang: string): string {
  return `You read a photo of a German vehicle registration document (Fahrzeugschein / Zulassungsbescheinigung Teil I). Extract ONLY the fields below and return them as a single minified JSON object — no markdown, no commentary. Use null for anything not clearly legible. Do NOT guess.

{"kennzeichen":string|null,        // licence plate, field (A)
 "marke":string|null,              // make, field (D.1) e.g. "BMW"
 "modell":string|null,             // model / type, field (D.3) e.g. "320d"
 "erstzulassung":string|null,      // date of first registration, field (B) e.g. "2017-03"
 "kraftstoff":string|null,         // fuel type, field (P.3), normalize to "Diesel" or "Benzin" (or the literal if other)
 "leistung_kw":string|null,        // engine power in kW, field (P.2)
 "fin":string|null}                // VIN / Fahrgestellnummer, field (E)

Return the JSON object only.`
}

interface Doc {
  kennzeichen: string | null
  marke: string | null
  modell: string | null
  erstzulassung: string | null
  kraftstoff: string | null
  leistung_kw: string | null
  fin: string | null
}

function extractJson(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1)
  return t
}

/** Build "Marke Modell (Baujahr)" for the order's vehicle field. */
function vehicleLine(d: Partial<Doc>): string {
  const year = d.erstzulassung ? String(d.erstzulassung).slice(0, 4) : ''
  return [d.marke, d.modell, year].filter(Boolean).join(' ').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!NVIDIA_API_KEY) return json({ error: 'NVIDIA_API_KEY not configured' }, 500)

  let payload: { image?: unknown; mime?: unknown; lang?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (typeof payload.image !== 'string' || payload.image.length === 0) {
    return json({ error: 'missing image' }, 400)
  }
  const mime = typeof payload.mime === 'string' ? payload.mime : 'image/jpeg'
  const lang = typeof payload.lang === 'string' ? payload.lang : 'de'
  const dataUri = payload.image.startsWith('data:') ? payload.image : `data:${mime};base64,${payload.image}`

  const chat = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt(lang) },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]

  let res: Response
  try {
    res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: VISION_MODEL, messages: chat, temperature: 0.1, max_tokens: 512 }),
    })
  } catch (e) {
    return json({ error: `vision upstream fetch failed: ${e}` }, 502)
  }
  if (!res.ok) {
    const txt = await res.text()
    return json({ error: `vision model ${res.status}: ${txt.slice(0, 300)}` }, 502)
  }
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''
  let doc: Partial<Doc>
  try {
    doc = JSON.parse(extractJson(content))
  } catch {
    return json({ error: 'could not parse vision output', raw: content.slice(0, 300) }, 502)
  }

  return json({ doc, vehicle: vehicleLine(doc) })
})
