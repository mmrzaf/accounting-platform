import test from 'node:test'
import assert from 'node:assert/strict'
import { completeChat } from '../../src/modules/ai/provider.ts'
import { AiError } from '../../src/modules/ai/errors.ts'

const request = { baseUrl: 'https://provider.example/v1', apiKey: 'test-only-key', model: 'test-model', messages: [], tools: [] }

test('provider adapter reads a bounded valid completion', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: 'The account is settled.' } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  const result = await completeChat({ ...request, fetcher })
  assert.equal(result.text, 'The account is settled.')
  assert.deepEqual(result.calls, [])
})

test('provider adapter rejects oversized responses before buffering the entire body', async () => {
  const fetcher: typeof fetch = async () => new Response('x'.repeat(500_001), { status: 200 })
  await assert.rejects(() => completeChat({ ...request, fetcher }),
    (error: unknown) => error instanceof AiError && error.code === 'PROVIDER_RESPONSE_INVALID')
})
