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
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Send the conversation to the `intake-agent` edge function, which calls the
 * NVIDIA Nemotron omni model to extract case fields and return the next
 * question (or a completion message).
 */
export async function runIntakeAgent(
  messages: AgentMessage[],
  lang: string,
): Promise<{ result: AgentResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('intake-agent', {
    body: { messages, lang },
  })
  if (error) return { result: null, error: error.message }
  if (data?.error) return { result: null, error: String(data.error) }
  return { result: data as AgentResult, error: null }
}
