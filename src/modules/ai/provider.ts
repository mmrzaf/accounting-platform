import { aiError } from './errors.ts'
import { required } from './validation.ts'

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}
export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ProviderResult { text: string; calls: ToolCall[]; finishReason: string | null }

export function validatedBaseUrl(raw: string): string {
  const value = required(raw, 'base URL', 512)
  let url: URL
  try { url = new URL(value) } catch { return aiError('INVALID_INPUT', 'Invalid provider base URL') }
  // A local model can run without internet; other endpoints must use TLS. Redirects are forbidden.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash)
    return aiError('INVALID_INPUT', 'Provider URL must use HTTPS (HTTP permitted only for loopback) and contain no credentials')
  if (url.pathname.includes('..') || url.pathname.includes('\\')) return aiError('INVALID_INPUT', 'Invalid provider URL path')
  return url.toString().replace(/\/$/u, '')
}

interface CompletionResponse {
  choices?: { finish_reason?: string | null; message?: { content?: string | null; tool_calls?: ToolCall[] } }[]
}
/** Small fetch-based OpenAI Chat Completions adapter; no provider SDK dependency or global configuration. */
export async function completeChat(input: {
  fetcher: typeof fetch; baseUrl: string; apiKey: string; model: string; messages: ChatMessage[]; tools: ToolDefinition[];
  timeoutMs?: number
}): Promise<ProviderResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000)
  try {
    const request = { model: input.model, messages: input.messages,
      ...(input.tools.length ? { tools: input.tools, tool_choice: 'auto' } : {}) }
    const response = await input.fetcher(`${input.baseUrl}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(request),
    })
    if (!response.ok) return aiError('PROVIDER_UNAVAILABLE', `AI provider request failed (HTTP ${response.status})`)
    // Bound bytes while streaming: response.text() would first buffer an untrusted
    // provider response without any effective upper limit.
    const reader = response.body?.getReader()
    if (!reader) return aiError('PROVIDER_RESPONSE_INVALID', 'Provider returned an empty response')
    const chunks: Buffer[] = []
    let receivedBytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        receivedBytes += value.byteLength
        if (receivedBytes > 500_000) {
          controller.abort()
          return aiError('PROVIDER_RESPONSE_INVALID', 'AI provider response exceeded size limit')
        }
        chunks.push(Buffer.from(value))
      }
    } finally { reader.releaseLock() }
    const raw = Buffer.concat(chunks, receivedBytes).toString('utf8')
    let payload: CompletionResponse
    try { payload = JSON.parse(raw) as CompletionResponse } catch { return aiError('PROVIDER_RESPONSE_INVALID', 'Provider returned invalid JSON') }
    const choice = payload.choices?.[0]
    if (!choice?.message || !Array.isArray(payload.choices) || payload.choices.length !== 1) return aiError('PROVIDER_RESPONSE_INVALID', 'Malformed provider completion')
    const calls = choice.message.tool_calls ?? []
    if (!Array.isArray(calls) || calls.length > 8 || calls.some(call => !call || call.type !== 'function' || typeof call.id !== 'string' || call.id.length > 128 || !call.id || typeof call.function?.name !== 'string' || typeof call.function.arguments !== 'string'))
      return aiError('PROVIDER_RESPONSE_INVALID', 'Invalid provider tool calls')
    return { text: typeof choice.message.content === 'string' ? choice.message.content.slice(0, 10000) : '', calls, finishReason: choice.finish_reason ?? null }
  } catch (error) {
    if (error instanceof Error && error.name === 'AiError') throw error
    return aiError('PROVIDER_UNAVAILABLE', 'AI provider unavailable or timed out')
  } finally { clearTimeout(timeout) }
}
