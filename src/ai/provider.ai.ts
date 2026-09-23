import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'

export const ai_google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })

export const ai_groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})
