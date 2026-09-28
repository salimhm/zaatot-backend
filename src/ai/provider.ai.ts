import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'

export const ai_google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })

export const ai_google_default_model = process.env.GOOGLE_DEFAULT_AI_MODEL_NAME || 'gemini-3.8-flash'

export const ai_groq = createGroq({
  apiKey: process.env.GROQ_AI_API_KEY,
})

export const ai_groq_default_model = process.env.GROQ_DEFAULT_AI_MODEL_NAME || 'openai/gpt-oss-20b'
