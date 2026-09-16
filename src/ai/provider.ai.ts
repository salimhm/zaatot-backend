import { createGoogleGenerativeAI } from '@ai-sdk/google'

export const ai_google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
