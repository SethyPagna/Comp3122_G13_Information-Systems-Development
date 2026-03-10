const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

const FREE_MODELS = [
  'arcee-ai/trinity-large-preview:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'stepfun/step-3.5-flash:free',
]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterOptions {
  messages:     ChatMessage[]
  maxTokens?:   number
  temperature?: number
  model?:       string
}

export async function openRouterChat(opts: OpenRouterOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set in .env.local')

  const modelsToTry = opts.model ? [opts.model] : FREE_MODELS
  const errors: string[] = []

  for (const model of modelsToTry) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'https://atlas-learning.app',
          'X-Title':       'Atlas Learning Platform',
        },
        body: JSON.stringify({
          model,
          max_tokens:  opts.maxTokens  ?? 2000,
          temperature: opts.temperature ?? 0.4,
          messages:    opts.messages,
        }),
      })

      const data = await res.json()

      if (res.status === 429 || res.status === 503 || res.status === 502) {
        errors.push(`${model}: ${res.status} overloaded`); continue
      }
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status} — ${data?.error?.message ?? ''}`); continue
      }
      if (data.error) {
        errors.push(`${model}: ${data.error.message ?? JSON.stringify(data.error)}`); continue
      }

      const text: string = data.choices?.[0]?.message?.content ?? ''
      if (!text) { errors.push(`${model}: empty response`); continue }

      console.log(`[openrouter] used: ${model}`)
      return text
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(`All models failed. Errors:\n${errors.join('\n')}`)
}

export function parseJsonResponse<T>(raw: string): T {
  let clean = raw.trim()
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = clean.indexOf('{')
  const end   = clean.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON found in model response')
  return JSON.parse(clean.slice(start, end + 1)) as T
}
