import { supabase } from '@/lib/supabase'

export interface AgentFields {
  situation: string | null
  engineStarted: string | null
  litres: string | null
  location: string | null
  vehicle: string | null
  contactName: string | null
  contactPhone: string | null
}

export interface AgentResult {
  fields: AgentFields
  missing: string[]
  complete: boolean
  reply: string
  /** Verbatim transcription when the turn was a voice message; null otherwise. */
  transcript: string | null
  /** Context-relevant quick-reply options for the question just asked. */
  suggestions: string[]
  /** True when the current reply asks the customer for their location. */
  asksLocation: boolean
  /** True when the reply asks for a free-text answer (name/phone/vehicle/location); no chips. */
  asksFreeText: boolean
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Send the conversation to the `intake-agent` edge function. Text turns go
 * straight to the extraction model; a voice turn passes `audio` (base64 WAV),
 * which the function transcribes with the ASR model before extracting.
 */
async function invokeAgent(
  messages: AgentMessage[],
  lang: string,
  audio?: string,
): Promise<{ result: AgentResult | null; error: string | null }> {
  // Transcription/extraction can fail intermittently; retry once on a transient
  // error before surfacing it so the customer isn't dead-ended mid-conversation.
  let lastError = 'unknown error'
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke('intake-agent', {
      body: audio ? { messages, lang, audio } : { messages, lang },
    })
    if (!error && data && !data.error) return { result: data as AgentResult, error: null }
    lastError = error?.message ?? String(data?.error ?? 'unknown error')
  }
  return { result: null, error: lastError }
}

export function runIntakeAgent(messages: AgentMessage[], lang: string) {
  return invokeAgent(messages, lang)
}

/**
 * Send a voice message: the prior text history plus the recorded audio. The
 * function transcribes the audio (ASR), appends it as a text turn, then runs
 * extraction; `result.transcript` is what the customer said, which the UI then
 * stores as text in the history.
 */
export function runIntakeAgentVoice(history: AgentMessage[], wavBase64: string, lang: string) {
  return invokeAgent(history, lang, wavBase64)
}
