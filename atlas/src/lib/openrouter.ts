/**
 * OpenRouter AI client
 * Uses the OpenAI-compatible chat completions endpoint.
 * Model: stepfun/step-3.5-flash:free  (free tier, no usage cost)
 * Docs: https://openrouter.ai/docs
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'stepfun/step-3.5-flash:free'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterOptions {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  /** Override model (defaults to step-3.5-flash:free) */
  model?: string
}

/**
 * Call OpenRouter and return the assistant message text.
 * Throws on non-200 responses with a descriptive error.
 */
export async function openRouterChat(opts: OpenRouterOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set in .env.local')

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // OpenRouter recommends these headers for analytics / free-tier access
      'HTTP-Referer': 'https://atlas-learning.app',
      'X-Title': 'Atlas Learning Platform',
    },
    body: JSON.stringify({
      model: opts.model ?? MODEL,
      max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${body}`)
  }

  const data = await response.json()

  // Handle both standard and error shapes
  if (data.error) {
    throw new Error(`OpenRouter API error: ${data.error.message ?? JSON.stringify(data.error)}`)
  }

  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenRouter returned an empty response')
  return text
}

/**
 * Strip markdown code fences from a response and parse JSON.
 * Useful when the model wraps JSON in ```json ... ```
 */
export function parseJsonResponse<T>(raw: string): T {
  let clean = raw.trim()
  // Remove ```json ... ``` or ``` ... ```
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  // Some models prepend explanatory text before the JSON — find the first {
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start !== -1 && end !== -1) {
    clean = clean.slice(start, end + 1)
  }
  return JSON.parse(clean) as T
}
