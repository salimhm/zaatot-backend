import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export const ai_cloudflare = createOpenAICompatible({
  name: 'cloudflare',
  apiKey: process.env.CF_WORKER_AI_API_KEY,
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1`,
  headers: {
    'cf-aig-gateway-id': process.env.CF_AI_GATEWAY_ID || 'default',
  },
  supportsStructuredOutputs: true,
})

export const ai_cloudflare_default_model = process.env.CF_WORKER_AI_DEFAULT_MODEL_NAME || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export const ai_google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })

export const ai_google_default_model = process.env.GOOGLE_DEFAULT_AI_MODEL_NAME || 'gemini-3.5-flash-lite'

export const ai_groq = createGroq({
  apiKey: process.env.GROQ_AI_API_KEY,
})

export const ai_groq_default_model = process.env.GROQ_DEFAULT_AI_MODEL_NAME || 'openai/gpt-oss-20b'
