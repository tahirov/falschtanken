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
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A message as sent to the edge function — content may be an audio part array. */
type OutgoingMessage =
  | AgentMessage
  | {
      role: 'user'
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'audio_url'; audio_url: { url: string } }
      >
    }

/**
 * Send the conversation to the `intake-agent` edge function, which calls the
 * NVIDIA Nemotron omni model to extract case fields and return the next
 * question (or a completion message).
 */
async function invokeAgent(
  messages: OutgoingMessage[],
  lang: string,
): Promise<{ result: AgentResult | null; error: string | null }> {
  // The reasoning model fails intermittently; retry once on a transient error
  // before surfacing it so the customer isn't dead-ended mid-conversation.
  let lastError = 'unknown error'
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke('intake-agent', {
      body: { messages, lang },
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
 * Send a voice message: the prior text history plus a final audio turn. The
 * omni model transcribes and extracts in one call; `result.transcript` is what
 * the customer said, which the UI then stores as text in the history.
 */
export function runIntakeAgentVoice(history: AgentMessage[], wavBase64: string, lang: string) {
  const audioTurn: OutgoingMessage = {
    role: 'user',
    content: [
      { type: 'text', text: "Voice message from the customer — transcribe it into the JSON 'transcript' field, then extract fields from it." },
      { type: 'audio_url', audio_url: { url: `data:audio/wav;base64,${wavBase64}` } },
    ],
  }
  return invokeAgent([...history, audioTurn], lang)
}
