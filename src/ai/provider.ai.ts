import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const cloudflare_workers_ai_base_url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1`

// Workers AI exposes OpenAI-compatible chat-completions endpoints. This model supports
// both JSON-mode output and traditional function calling, which the workflow requires.
export const ai_cloudflare = createOpenAICompatible({
  name: 'cloudflare-workers-ai',
  apiKey: process.env.CF_API_KEY,
  baseURL: cloudflare_workers_ai_base_url,
  supportsStructuredOutputs: true,
})

export const ai_cloudflare_default_model = process.env.CF_DEFAULT_AI_MODEL_NAME || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
